import { NextResponse, type NextRequest } from "next/server";
import { checkoutSchema } from "@/lib/validation/checkout";
import {
  createOrder,
  getOrderByIdempotencyKey,
  attachRazorpayOrderId,
  InsufficientStockError,
  UnknownVariantError,
} from "@/db/queries/orders";
import { createRazorpayOrder } from "@/lib/razorpay";
import { buildOrderConfirmedEmail } from "@/emails/order-confirmed";
import { sendAndLog } from "@/lib/mail";
import { DbUnconfiguredError } from "@/db/pool";
import { appUrl, hasRazorpay } from "@/lib/env";

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
