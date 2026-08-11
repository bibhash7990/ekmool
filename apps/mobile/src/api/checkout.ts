import * as Crypto from "expo-crypto";

import { checkoutSchema } from "@ekmool/contracts/checkout";
import type {
  ApiValidationIssue,
  CheckoutSuccessResponse,
  CouponRefusalReason,
} from "@ekmool/contracts/responses";

import { apiPost, type ApiFailure, type ApiResult } from "@/api/client";

/**
 * `POST /api/checkout`, from the phone.
 *
 * Three things this module is responsible for and nothing else is: minting
 * the idempotency key, refusing to send anything the shared schema would not
 * accept, and handing a screen the *typed* extras that ride along with a
 * refusal. The screen decides what to draw; this file decides what goes on
 * the wire.
 *
 * **Cash on Delivery only.** `paymentMethod` is not a parameter — it is
 * written into the body below, once, as a constant. The app carries no
 * payment SDK in this change, and the way to make that true is for there to
 * be no path through this function that can ask for online payment. A
 * `paymentMethod` argument would compile perfectly the day someone passed
 * `"razorpay"` from a screen with no way to open a payment window, and the
 * customer would meet that mistake at the last step of a form they had
 * already filled in.
 */

/* ------------------------------------------------------------------ */
/* The idempotency key                                                 */

/** Crockford base32 — no I, L, O or U, so a key cannot be misread aloud. */
const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 48 bits of millisecond timestamp, which is what 10 base32 characters hold. */
const TIME_CHARS = 10;

/** 80 bits of randomness — exactly 16 base32 characters, no padding. */
const RANDOM_BYTES = 10;

function encodeTime(ms: number): string {
  // Division and `%`, never `>>`. JavaScript's bitwise operators truncate to
  // 32 bits, and the timestamp is 41 bits today — a shift would silently
  // discard the high bits and hand every phone in the world the same prefix.
  let remaining = Math.floor(ms);
  const out = new Array<string>(TIME_CHARS);
  for (let i = TIME_CHARS - 1; i >= 0; i -= 1) {
    out[i] = CROCKFORD32[remaining % 32];
    remaining = Math.floor(remaining / 32);
  }
  return out.join("");
}

function encodeRandom(bytes: Uint8Array): string {
  // An index loop rather than `for..of`: iterating a Uint8Array needs
  // downlevel iteration to compile to something that is not a surprise, and
  // `src/lib/install-id.ts` reached the same conclusion for the same reason.
  let out = "";
  let accumulator = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    accumulator = (accumulator << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD32[(accumulator >> bits) & 31];
    }
  }
  // 80 bits divides by 5 exactly, so `bits` is 0 here and nothing is dropped.
  return out;
}

/**
 * A ULID for one checkout attempt.
 *
 * **Generated once, when the customer first taps Place Order, and held for
 * that attempt.** A retry after a timeout must carry the same key or it is
 * not a retry, it is a second order: the server's unique index turns a repeat
 * into a 200 with `replayed: true` and returns the order that already exists,
 * and that defence only works for a client that reuses the key.
 *
 * `expo-crypto` rather than a `ulid` package (rule 12 — ask before adding a
 * dependency). The whole implementation is the forty lines above, it is
 * already a dependency because `src/lib/install-id.ts` needs a CSPRNG, and
 * the alternative is a package in the binary for one function.
 *
 * The timestamp prefix is not decoration: keys sort by mint time, so a
 * support conversation about a duplicated order can be answered from the
 * key alone. `Math.random()` was never a candidate — two phones minting the
 * same key would each get the other's order.
 */
export function newIdempotencyKey(): string {
  return encodeTime(Date.now()) + encodeRandom(Crypto.getRandomBytes(RANDOM_BYTES));
}

/* ------------------------------------------------------------------ */
/* The request                                                         */

/**
 * What a screen collects. Flat strings, because that is what a `TextInput`
 * produces — the schema does the trimming, the upper-casing and the refusing.
 *
 * `paymentMethod` is absent on purpose; see the note at the top of the file.
 * So are prices, discounts and totals: `docs/SECURITY.md` — "the cart sends
 * variant ids and quantities; a coupon sends its code and nothing else". The
 * checkout transaction recomputes every figure from rows it holds a lock on,
 * so anything else this client said about money could only ever be ignored or
 * believed, and one of those is a vulnerability.
 */
export interface CheckoutDraft {
  customer: { name: string; email: string; phone: string };
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
    landmark: string;
  };
  items: readonly { variantId: number; qty: number }[];
  notes: string;
  /** The code as typed, or "". Never what the client thinks it is worth. */
  couponCode: string;
}

/**
 * Longer than `DEFAULT_TIMEOUT_MS`, and the only request in the app that gets
 * a longer one.
 *
 * A timeout here is not "no answer" — it is "no answer *yet*", against a
 * request that may already have committed a row. That ambiguity costs the
 * customer a retry and costs support a conversation, so it is worth eight
 * more seconds of a spinner to avoid. The idempotency key makes the retry
 * safe; it does not make it free.
 */
const CHECKOUT_TIMEOUT_MS = 20_000;

/**
 * Shaped exactly like the server's 422 so a screen has one branch, not two.
 * `src/api/session.ts` does the same thing for the same reason.
 */
function localValidationFailure(issues: ApiValidationIssue[]): ApiFailure {
  return {
    ok: false,
    code: "VALIDATION_FAILED",
    // The server's own wording for this case, so the two doors refuse in the
    // same words. The per-field messages are the schema's, and they are what
    // the customer actually reads.
    message: "Please check the highlighted fields",
    payload: { issues },
  };
}

/**
 * Places the order.
 *
 * Validates locally first — **for the message, never for the decision.** The
 * server re-runs the identical schema and its answer is the only one that
 * counts. What the local pass buys is that a phone on a connection somebody
 * pays for by the megabyte does not spend a round trip to be told a PIN code
 * is five digits.
 *
 * Never throws. An expected refusal is a value: `INSUFFICIENT_STOCK` is an
 * answer the screen has to render, not an exception it has to catch.
 */
export async function placeCodOrder(
  draft: CheckoutDraft,
  idempotencyKey: string,
): Promise<ApiResult<CheckoutSuccessResponse>> {
  const parsed = checkoutSchema.safeParse({
    ...draft,
    // The scope decision, in the one place it can be enforced.
    paymentMethod: "cod",
  });

  if (!parsed.success) {
    return localValidationFailure(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  // `parsed.data`, not `draft`: the schema trims every string and upper-cases
  // the coupon code, so sending the raw input would send something the server
  // then normalises differently from what the screen validated.
  const result = await apiPost<CheckoutSuccessResponse>(
    "/api/checkout",
    parsed.data,
    { idempotencyKey, timeoutMs: CHECKOUT_TIMEOUT_MS },
  );

  if (!result.ok) return result;

  // A 2xx whose body has no order id is a broken deployment, not an order.
  // Without this check the receipt screen navigates to `/receipt/undefined`
  // and tells a customer their order reference is "UNDEFINED", which is the
  // worst possible moment for this app to be confidently wrong.
  if (typeof result.data.orderId !== "string" || result.data.orderId.length === 0) {
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Something went wrong placing your order. Please try again.",
      payload: result.data,
    };
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Reading the extras off a refusal                                    */

/*
 * `ApiFailure.payload` is `unknown` on purpose — the shape depends on the
 * code, and @ekmool/contracts/responses declares each one. Narrowing it is
 * the job of the caller that knows which code it asked about, and these three
 * helpers are that narrowing, written once so three screens cannot each write
 * a slightly different cast.
 */

function record(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

/** The `sku` and the real number left, off an `INSUFFICIENT_STOCK` refusal. */
export function insufficientStockDetail(
  failure: ApiFailure,
): { sku: string; available: number } | null {
  if (failure.code !== "INSUFFICIENT_STOCK") return null;
  const body = record(failure.payload);
  if (typeof body.sku !== "string") return null;
  // `available` is 0 when the pack sold out entirely, so 0 is a value and not
  // a missing field — hence the explicit finite check rather than a falsy one.
  const available =
    typeof body.available === "number" && Number.isFinite(body.available)
      ? body.available
      : 0;
  return { sku: body.sku, available: Math.max(0, Math.trunc(available)) };
}

/**
 * Which rule refused a coupon.
 *
 * Use it to decide what to *do* — offer to drop a dead code — and print
 * `failure.message`, which the server composed from the reason **and its
 * threshold** ("That code needs a basket of at least ₹500"). The reason alone
 * cannot carry the number, so a sentence written here would have to be
 * vaguer than the server's, and the vaguer one is what the design system
 * forbids.
 */
export function couponRefusalReason(
  failure: ApiFailure,
): CouponRefusalReason | null {
  if (failure.code !== "COUPON_REFUSED") return null;
  const reason = record(failure.payload).reason;
  return typeof reason === "string" ? (reason as CouponRefusalReason) : null;
}

/** The `issues` array off a `VALIDATION_FAILED`, local or from the server. */
export function validationIssues(failure: ApiFailure): ApiValidationIssue[] {
  if (failure.code !== "VALIDATION_FAILED") return [];
  const issues = record(failure.payload).issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue: unknown) => {
    const entry = record(issue);
    return typeof entry.path === "string" && typeof entry.message === "string"
      ? [{ path: entry.path, message: entry.message }]
      : [];
  });
}

/**
 * Issues keyed by the field they belong to, ready to hang next to an input.
 *
 * The last path segment is the key: the server sends `customer.phone` and
 * `address.pincode`, and the form is flat because the inputs are. First
 * message wins — a field with two complaints has one thing wrong with it as
 * far as the person typing is concerned.
 */
export function fieldErrorsFromIssues(
  issues: readonly ApiValidationIssue[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const field = issue.path.split(".").pop();
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
