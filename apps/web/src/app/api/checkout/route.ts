import { NextResponse, type NextRequest } from "next/server";
import { checkoutSchema } from "@ekmool/contracts/checkout";
import {
  createOrder,
  getOrderByIdempotencyKey,
  attachRazorpayOrderId,
  InsufficientStockError,
  UnknownVariantError,
  CouponRefusedError,
} from "@/db/queries/orders";
import { couponRefusalMessage } from "@ekmool/core/coupons";
import { createRazorpayOrder } from "@/lib/razorpay";
import { buildOrderConfirmedEmail } from "@/emails/order-confirmed";
import { sendAndLog } from "@/lib/mail";
import { DbUnconfiguredError } from "@/db/pool";
import { appUrl, hasRazorpay } from "@/lib/env";
import { verifyChallenge } from "@/lib/turnstile";
import { HONEYPOT_FIELD } from "@/lib/honeypot";
import {
  clientIp,
  readInstallId,
  nativeCheckoutCeiling,
} from "@/lib/rate-limit";
import { CLIENT_HEADER, isNativeClient } from "@ekmool/contracts/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDbDown(error: unknown): boolean {
  if (error instanceof DbUnconfiguredError) return true;
  if (!(error instanceof Error) || !("code" in error)) return false;
  return [
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "PROTOCOL_CONNECTION_LOST",
    "ER_CON_COUNT_ERROR",
  ].includes(String(error.code));
}

export async function POST(request: NextRequest) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  if (!idempotencyKey || idempotencyKey.length < 8) {
    return NextResponse.json(
      {
        error: "An Idempotency-Key header of at least 8 characters is required",
        code: "IDEMPOTENCY_KEY_REQUIRED",
      },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const ip = clientIp(request.headers);

  /*
   * Two doors onto the same abuse problem, and only one of them is Turnstile.
   *
   * What actually protects this route is below and is unchanged by any of
   * this: the transaction recomputes every price from rows it holds a lock
   * on, the stock decrement is atomic, `Idempotency-Key` plus a unique index
   * turns a replay into the original order, and `orders.razorpay_payment_id`
   * is uniquely indexed. A challenge does none of that. Its one job is to
   * raise the cost of *volume* — a script placing a thousand COD orders to
   * fake addresses.
   *
   * A phone has no widget to render and no form to hide a honeypot in, so
   * `verifyChallenge` cannot run against it. The naive fix is to skip the
   * challenge whenever `X-Ekmool-Client` says mobile. That is a straight
   * regression in browser abuse resistance, because the header is not a
   * credential and any bot can send it — so it is not what happens here.
   *
   * Instead the claim is priced. A request that declares itself native *and*
   * carries a well-formed install id may skip the challenge, and in exchange
   * accepts a volume ceiling an order of magnitude below a browser's: three
   * orders an hour per install and ten an hour per IP, on top of the 10/min
   * IP bucket in src/proxy.ts, which is unchanged.
   *
   * **A bot that wants volume is worse off claiming native than solving
   * Turnstile.** Solved challenges go for about a dollar per thousand, and
   * at today's 10/min a solver could place 600 orders an hour from one
   * address; claiming native caps the same address at 10. There is nothing
   * to gain by lying about being a phone, which is the property that makes
   * the forgeable header safe to act on.
   *
   * A browser with no install id is completely unaffected: the challenge
   * stays mandatory, a missing Turnstile token is still a refusal, and the
   * refusal is still shaped like every other 400 so a bot learns nothing.
   *
   * Play Integrity and App Attest are the correct long-term answer and are
   * deliberately not attempted here. Each is a config plugin, a server
   * verification path, a key to manage and a new documented inert state for
   * when that key is absent. That is its own milestone, not a line in this
   * one.
   */
  // Both halves or neither. One value rather than a boolean beside a
  // nullable string, so the compiler carries "this is a native request" and
  // "this is the id its ceiling is metered against" as the same fact — they
  // must never be able to disagree.
  const installId = readInstallId(request.headers);
  const nativeInstall: string | null =
    installId !== null && isNativeClient(request.headers.get(CLIENT_HEADER))
      ? installId
      : null;

  // Before validation, so a bot never learns which of its fields were
  // wrong. The refusal is deliberately shaped like every other 400 here.
  const envelope = (payload ?? {}) as Record<string, unknown>;
  const challenge = nativeInstall
    ? ({ ok: true } as const)
    : await verifyChallenge({
        honeypot: envelope[HONEYPOT_FIELD],
        token: envelope.turnstileToken,
        ip,
      });
  if (!challenge.ok) {
    return NextResponse.json(
      {
        error: "We could not verify this request. Please reload and try again.",
        code: "CHALLENGE_FAILED",
      },
      { status: 400 },
    );
  }

  const parsed = checkoutSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields",
        code: "VALIDATION_FAILED",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  const checkout = parsed.data;

  if (checkout.paymentMethod === "razorpay" && !hasRazorpay) {
    return NextResponse.json(
      {
        error: "Online payment is not available yet. Please choose Cash on Delivery.",
        code: "RAZORPAY_NOT_CONFIGURED",
      },
      { status: 400 },
    );
  }

  /*
   * The other half of the trade described above: the hourly ceiling a native
   * client pays for skipping the challenge.
   *
   * Here rather than beside the challenge decision, and here rather than in
   * src/proxy.ts, because it meters *orders* and this is the last point
   * before one is created. Checked earlier it would also meter malformed
   * bodies, and three bad requests from a real app would lock a real
   * customer out for twenty minutes behind a message that explains nothing.
   *
   * An idempotent replay of a timed-out order does spend a token, because
   * the only way to know a request is a replay is to attempt the insert.
   * Three an hour leaves room for that; one an hour would not have.
   */
  if (nativeInstall !== null) {
    const withinCeiling = await nativeCheckoutCeiling({
      installId: nativeInstall,
      ip,
    });
    if (!withinCeiling) {
      // The same generic refusal as any other declined checkout, deliberately.
      // "Too many orders from this device" would tell a prober exactly which
      // dial it had hit, and therefore which one to work around.
      return NextResponse.json(
        {
          error: "We could not verify this request. Please reload and try again.",
          code: "CHALLENGE_FAILED",
        },
        { status: 400 },
      );
    }
  }

  try {
    const order = await createOrder({ idempotencyKey, checkout });

    let razorpayOrderId: string | null = null;
    if (checkout.paymentMethod === "razorpay") {
      const rzp = await createRazorpayOrder({
        amountPaise: order.totalPaise,
        receipt: order.id,
      });
      razorpayOrderId = rzp.id;
      await attachRazorpayOrderId(order.id, razorpayOrderId);
    }

    // Deliberately NOT revalidating the catalogue here.
    //
    // Purging the prerendered pages on every order would (a) force a DB
    // round trip to regenerate them, defeating the static-serving model
    // this site depends on at 10k concurrent users, and (b) leave
    // browsing broken if the database is unreachable at that moment —
    // the page has no cached copy left to fall back to.
    //
    // Stock display refreshes on the hourly ISR window; correctness does
    // not depend on it, because the atomic decrement above is the only
    // authority on whether an item can actually be sold.

    // COD is confirmed immediately, so the receipt goes out now. Online
    // orders get theirs from the webhook once payment actually lands.
    // Fire-and-forget: a mail outage must not fail a paid order.
    if (checkout.paymentMethod === "cod") {
      void sendAndLog(
        "order_confirmed",
        buildOrderConfirmedEmail(order, appUrl),
        order.id,
      ).catch((error: unknown) =>
        console.error("[checkout] confirmation email failed:", error),
      );
    }

    return NextResponse.json(
      {
        orderId: order.id,
        status: order.status,
        totalPaise: order.totalPaise,
        paymentMethod: order.paymentMethod,
        razorpayOrderId,
        razorpayKeyId: razorpayOrderId
          ? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
          : undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    // Idempotent replay: the unique index rejected a duplicate key, so
    // return the order that was created the first time.
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY" &&
      String(error.message).includes("idempotency")
    ) {
      const existing = await getOrderByIdempotencyKey(idempotencyKey);
      if (existing) {
        return NextResponse.json(
          {
            orderId: existing.id,
            status: existing.status,
            totalPaise: existing.totalPaise,
            paymentMethod: existing.paymentMethod,
            razorpayOrderId: existing.razorpayOrderId,
            razorpayKeyId: existing.razorpayOrderId
              ? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
              : undefined,
            replayed: true,
          },
          { status: 200 },
        );
      }
    }

    // The cart accepted a code that checkout would not — exhausted between
    // the two, expired on the stroke, or the basket changed under it. The
    // order was rolled back rather than placed at full price, so the reply
    // has to say which rule refused it and let them decide.
    if (error instanceof CouponRefusedError) {
      return NextResponse.json(
        {
          error: couponRefusalMessage(error.reason, {
            minSubtotalPaise: error.minSubtotalPaise ?? undefined,
          }),
          code: "COUPON_REFUSED",
          reason: error.reason,
        },
        { status: 409 },
      );
    }

    if (error instanceof InsufficientStockError) {
      return NextResponse.json(
        {
          error:
            error.available > 0
              ? `Only ${error.available} left of ${error.sku}. Please reduce the quantity.`
              : `${error.sku} just sold out. Please remove it from your cart.`,
          code: "INSUFFICIENT_STOCK",
          sku: error.sku,
          available: error.available,
        },
        { status: 409 },
      );
    }

    if (error instanceof UnknownVariantError) {
      return NextResponse.json(
        {
          error: "One of the items in your cart is no longer available.",
          code: "UNKNOWN_VARIANT",
        },
        { status: 409 },
      );
    }

    if (isDbDown(error)) {
      console.error("[checkout] database unavailable:", error);
      return NextResponse.json(
        {
          error:
            "We could not reach our order system just now. Nothing has been charged — please try again in a moment.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    console.error("[checkout] unexpected failure:", error);
    return NextResponse.json(
      {
        error: "Something went wrong placing your order. Please try again.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
