import { couponCodeSchema } from "@ekmool/contracts/checkout";
import type { CouponPreviewResponse } from "@ekmool/contracts/responses";
import { couponRefusalMessage, type CouponRefusal } from "@ekmool/core/coupons";

import { apiPost } from "@/api/client";

/**
 * `POST /api/coupons/preview` — what a code is worth against this basket.
 *
 * **A quote, not a reservation.** Checkout re-runs every rule against a
 * locked coupon row and can still refuse a code that passed here: claimed by
 * somebody else in between, expired on the stroke, or applied to a basket
 * that has since changed. Holding a use while a customer browses was the
 * rejected alternative — a handful of abandoned baskets would exhaust a
 * promotion.
 *
 * Two shapes on the wire that a client can get wrong, so both are named here:
 *
 *  1. **A refusal is a 200.** `apps/web/src/app/api/coupons/preview/route.ts`
 *     answers `{ code: "COUPON_REFUSED", reason, error }` with status 200,
 *     because a quote of "no" is a successful quote. `@/api/client` therefore
 *     hands it back as `ok: true`, and switching on `result.ok` alone would
 *     read a refusal as a grant. The switch below is on the body's `code`.
 *  2. **The reply carries no subtotal.** The server recomputes it from its own
 *     rows, because a client that could name its own subtotal could name one
 *     just above a coupon's minimum.
 */

/**
 * What the endpoint accepts per line: an id and a quantity, and nothing else.
 * Not `CartItem` — the price on a cart line is a copy of a catalogue this
 * phone may have been holding for an hour, and sending it would invite the
 * server to trust it.
 */
export interface CouponPreviewItem {
  variantId: number;
  qty: number;
}

/**
 * The three answers a screen has to be able to draw.
 *
 * `unchecked` is the one that would be missing from an obvious design, and it
 * is the important one. Offline, or with MySQL down, the code is neither
 * granted nor refused — nobody has looked. Collapsing that into a refusal
 * would tell a customer their valid code is invalid; collapsing it into a
 * grant of zero would present a guess as a fact. So it is its own state, the
 * code stays on the basket, and checkout decides.
 */
export type CouponQuote =
  | {
      status: "granted";
      /** The canonical code as stored, which may differ in case from the typed one. */
      couponCode: string;
      description: string;
      /** Money off the goods. Feeds `cartTotals`'s `discountPaise`. */
      goodsDiscountPaise: number;
      /** Delivery waived. Feeds `cartTotals`'s `shippingWaivedPaise`. */
      shippingWaivedPaise: number;
    }
  | { status: "refused"; reason: CouponRefusal; message: string }
  | { status: "unchecked"; message: string };

/**
 * Every refusal reason, as a runtime lookup.
 *
 * A `Record<CouponRefusal, true>` rather than an array because the record is
 * checked for completeness by the compiler: add a ninth reason to
 * `@ekmool/core/coupons` and this object fails typecheck, which is the only
 * alarm there is. A `readonly CouponRefusal[]` would have compiled happily
 * while silently mapping the new reason to "unknown".
 */
const REFUSAL_REASONS: Record<CouponRefusal, true> = {
  unknown: true,
  inactive: true,
  not_started: true,
  expired: true,
  below_minimum: true,
  exhausted: true,
  already_used: true,
  no_benefit: true,
};

function toRefusal(value: unknown): CouponRefusal {
  // Indexed rather than `value in REFUSAL_REASONS`: `in` walks the prototype,
  // so a body carrying `reason: "toString"` would pass it.
  return typeof value === "string" &&
    REFUSAL_REASONS[value as CouponRefusal] === true
    ? (value as CouponRefusal)
    : "unknown";
}

/**
 * The sentence to show for a refusal.
 *
 * **The server's `error` first, and `couponRefusalMessage` behind it.** Both
 * are the same function — the route composes its string by calling
 * `couponRefusalMessage(reason, { minSubtotalPaise })`, which is why the two
 * clients cannot disagree about a rule. The server's copy is preferred only
 * because it had the coupon row in hand and could fill in the threshold: the
 * reply carries `reason: "below_minimum"` but not the minimum itself, so
 * composing here from the reason alone would downgrade "That code needs a
 * basket of at least ₹500" to "Your basket is below the minimum for that
 * code" on every phone. The local call is what runs when a proxy truncates
 * the body or eats the field, and it is a real path, not a decoration.
 */
function refusalMessage(reason: CouponRefusal, serverError: unknown): string {
  return typeof serverError === "string" && serverError.trim().length > 0
    ? serverError
    : couponRefusalMessage(reason);
}

/**
 * Integer paise off the wire, or zero.
 *
 * Money is integer paise by rule 4. A non-integer or a negative here is a
 * broken deployment rather than a discount, and zero is the only safe way to
 * be wrong — it shows the customer a total no lower than what checkout will
 * charge, so the number never moves down at the last step.
 */
function paiseFromWire(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function stringFromWire(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const UNREADABLE =
  "That code could not be checked just now.";

export async function previewCoupon(
  code: string,
  items: readonly CouponPreviewItem[],
  options: { signal?: AbortSignal } = {},
): Promise<CouponQuote> {
  // Validated locally with the schema the server enforces, exactly as
  // `signIn` does — not to make the decision, but to save a round trip on a
  // connection the customer pays for by the megabyte. A code with a space or
  // a lowercase letter in it is normalised here rather than refused; one with
  // a `$` in it never leaves the phone.
  const parsed = couponCodeSchema.safeParse(code);
  if (!parsed.success) {
    return {
      status: "refused",
      reason: "unknown",
      message: couponRefusalMessage("unknown"),
    };
  }

  const result = await apiPost<CouponPreviewResponse>(
    "/api/coupons/preview",
    {
      code: parsed.data,
      items: items.map((item) => ({
        variantId: item.variantId,
        qty: item.qty,
      })),
    },
    { signal: options.signal },
  );

  if (!result.ok) {
    // 400 and 422 mean this body did not satisfy the endpoint's schema. The
    // check above should make that unreachable, so if it happens the code is
    // malformed in a way neither schema caught — "not valid" is then the
    // honest thing to say, and it is the shared sentence for it.
    if (result.code === "BAD_REQUEST" || result.code === "VALIDATION_FAILED") {
      return {
        status: "refused",
        reason: "unknown",
        message: couponRefusalMessage("unknown"),
      };
    }
    // Everything else — offline, timed out, rate limited, MySQL down — is a
    // question nobody answered. `result.message` already names the reason and
    // is display-ready; see the note on `ApiFailure.message`.
    return { status: "unchecked", message: result.message };
  }

  // Typed as the contract for documentation, narrowed as `unknown` for the
  // decision: `apiPost` casts the parsed JSON, it does not validate it, and
  // this app will still be running against a server it was not built with.
  const body: unknown = result.data;
  const record: Record<string, unknown> =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  if (record.code === "COUPON_OK") {
    return {
      status: "granted",
      // Falls back to what was typed. The canonical code differs only in
      // case, and showing the customer their own code beats showing nothing.
      couponCode: stringFromWire(record.couponCode) || parsed.data,
      description: stringFromWire(record.description),
      goodsDiscountPaise: paiseFromWire(record.goodsDiscountPaise),
      shippingWaivedPaise: paiseFromWire(record.shippingWaivedPaise),
    };
  }

  if (record.code === "COUPON_REFUSED") {
    const reason = toRefusal(record.reason);
    return {
      status: "refused",
      reason,
      message: refusalMessage(reason, record.error),
    };
  }

  // A 200 whose body is neither arm. Not a refusal — nothing refused it.
  return { status: "unchecked", message: UNREADABLE };
}
