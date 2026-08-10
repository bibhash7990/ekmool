/**
 * What the API sends back.
 *
 * Nothing declared these before: every handler builds its JSON inline, so
 * the shape of `POST /api/checkout` existed only as an object literal 140
 * lines into a route file, and the only way to learn it was to read that
 * file. That is survivable with one consumer who ships in the same deploy.
 * It is not survivable with a phone app in the App Store, which will still
 * be parsing last quarter's field names.
 *
 * These are read off the handlers as they behave today — including where
 * that is untidy, which is noted at each spot rather than smoothed over. A
 * DTO that describes what the server *should* send is worse than none:
 * it looks like a guarantee.
 *
 * Wiring the handlers' return types to these types is a follow-up. Until
 * that happens, nothing here is enforced by the compiler; a field renamed
 * in a handler will not fail typecheck yet.
 *
 * No copy lives in this package — see the note at the top of errors.ts.
 * Every `error` and `message` string below is composed on the server.
 */

import type { CheckoutInput } from "./checkout";
import type { ApiErrorCode } from "./errors";

// ---------------------------------------------------------------------------
// Vocabulary shared with @ekmool/core
// ---------------------------------------------------------------------------

/**
 * The order status as it appears on the wire.
 *
 * Structurally identical to `OrderStatus` in `@ekmool/core/order-status`,
 * and deliberately re-declared rather than imported: `contracts` depends on
 * zod and nothing else, and taking a dependency on `core` to name six
 * strings would make the wire vocabulary a downstream of the arithmetic.
 * Because the unions are identical, a core value is assignable here, so the
 * follow-up that annotates the handlers will fail typecheck the moment they
 * stop matching. That is the drift alarm; there is no other one.
 */
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";

/**
 * Which rule refused a coupon. Mirrors `CouponRefusal` in `@ekmool/core`,
 * for the reason above.
 *
 * The client must not turn these into sentences of its own. The server
 * sends the sentence in `error`, composed from the reason *and* the
 * threshold that produced it ("a basket of at least ₹500"), which is
 * information the reason alone does not carry. Use the reason to decide
 * what to *do* — offer a nudge to the minimum, clear a dead code from the
 * cart — and print `error`.
 */
export type CouponRefusalReason =
  | "unknown"
  | "inactive"
  | "not_started"
  | "expired"
  | "below_minimum"
  | "exhausted"
  | "already_used"
  | "no_benefit";

// ---------------------------------------------------------------------------
// The error envelope
// ---------------------------------------------------------------------------

/**
 * Every failure is `{ error, code }` plus, sometimes, fields specific to
 * that code. `error` is display-ready and already names the rule that
 * refused; a client renders it as-is.
 */
export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
}

/** One rejected field. `path` is the Zod path joined with dots. */
export interface ApiValidationIssue {
  path: string;
  message: string;
}

/**
 * A 422 from Zod.
 *
 * `issues` is optional, and that is a description of the server rather than
 * a convenience: checkout, account lookup, back-in-stock, returns and
 * reviews all send the mapped issues, but `/api/coupons/preview` sends
 * `{ error, code }` alone because its body is one field and there is
 * nothing to highlight. Making it required here would misdescribe that
 * route; changing that route to send an empty array is a behaviour change
 * and belongs in its own commit.
 */
export interface ValidationFailedResponse extends ApiErrorResponse {
  code: "VALIDATION_FAILED";
  issues?: ApiValidationIssue[];
}

/**
 * 429, from `apps/web/src/proxy.ts` — never from a handler, so any route
 * under `/api` can return this regardless of what its own DTO says.
 */
export interface RateLimitedResponse extends ApiErrorResponse {
  code: "RATE_LIMITED";
  /** Seconds to wait. Also sent as the `Retry-After` header. */
  retryAfter: number;
}

/** Checkout only. `available` is 0 when the pack sold out entirely. */
export interface InsufficientStockResponse extends ApiErrorResponse {
  code: "INSUFFICIENT_STOCK";
  sku: string;
  available: number;
}

/**
 * Sent by checkout as a 409 and by `/api/coupons/preview` as a **200** —
 * the preview is a quote, and a quote of "no" is a successful quote. A
 * client that keys on the status code alone will misread one of the two.
 */
export interface CouponRefusedResponse extends ApiErrorResponse {
  code: "COUPON_REFUSED";
  reason: CouponRefusalReason;
}

// ---------------------------------------------------------------------------
// POST /api/checkout
// ---------------------------------------------------------------------------

/**
 * 201 on a placed order, 200 on an idempotent replay.
 *
 * The two bodies are the same shape but not the same object: the replay
 * path adds `replayed: true` and is reached when the unique index rejects a
 * duplicate `Idempotency-Key`. A client that retried a timed-out request
 * should treat a replay as success and must not place a second order.
 */
export interface CheckoutSuccessResponse {
  /** A ULID. The last 8 characters are the reference printed for the customer. */
  orderId: string;
  status: OrderStatus;
  /** Integer paise. Recomputed server-side; whatever the cart thought is irrelevant. */
  totalPaise: number;
  paymentMethod: CheckoutInput["paymentMethod"];
  /** Null for COD, and for a Razorpay order whose gateway order was never attached. */
  razorpayOrderId: string | null;
  /**
   * Optional, not nullable: the handler sets it to `undefined` when there
   * is no Razorpay order, and `JSON.stringify` drops the key entirely
   * rather than sending null. It is also absent if the public key id is
   * unset in the environment.
   */
  razorpayKeyId?: string;
  /** Present, and always `true`, only on the idempotent-replay path. */
  replayed?: true;
}

/**
 * The failures checkout can return. `DB_UNAVAILABLE` at 503 says nothing
 * has been charged, which is the fact the customer needs before retrying.
 */
export type CheckoutErrorResponse =
  | ValidationFailedResponse
  | InsufficientStockResponse
  | CouponRefusedResponse
  | (ApiErrorResponse & {
      code:
        | "IDEMPOTENCY_KEY_REQUIRED"
        | "BAD_REQUEST"
        | "CHALLENGE_FAILED"
        | "RAZORPAY_NOT_CONFIGURED"
        | "UNKNOWN_VARIANT"
        | "DB_UNAVAILABLE"
        | "INTERNAL_ERROR";
    });

export type CheckoutResponse = CheckoutSuccessResponse | CheckoutErrorResponse;

// ---------------------------------------------------------------------------
// POST /api/account/lookup
// ---------------------------------------------------------------------------

/**
 * 200, and the response also carries the session cookie. This is the only
 * way into an account and there is no other kind of account — no
 * registration, ever.
 *
 * `email` is the normalised (trimmed, lower-cased) address that matched, so
 * a client can display it without re-deriving it.
 */
export interface AccountLookupSuccessResponse {
  orderId: string;
  email: string;
}

/**
 * 404 for every miss: wrong reference, wrong email, or a tripped honeypot.
 * One body and one status for all three, because a distinguishable failure
 * tells a prober which references exist.
 */
export type AccountLookupErrorResponse =
  | ValidationFailedResponse
  | (ApiErrorResponse & {
      code: "LOOKUP_FAILED" | "BAD_REQUEST" | "DB_UNAVAILABLE" | "INTERNAL_ERROR";
    });

export type AccountLookupResponse =
  | AccountLookupSuccessResponse
  | AccountLookupErrorResponse;

// ---------------------------------------------------------------------------
// POST /api/coupons/preview
// ---------------------------------------------------------------------------

/**
 * What a code is worth against the current basket. **A quote, not a
 * reservation** — checkout re-runs every rule against a locked row and can
 * still refuse a code that passed here.
 *
 * The subtotal is not in the request and is not in the reply: it is
 * recomputed from the database, because a client that could name its own
 * subtotal could name one just above a coupon's minimum.
 */
export interface CouponPreviewOkResponse {
  code: "COUPON_OK";
  /** The canonical code as stored, which may differ in case from what was typed. */
  couponCode: string;
  description: string;
  /** Money off the goods. This is the figure that moves the taxable value. */
  goodsDiscountPaise: number;
  /** Shipping waived — charged at zero rather than discounted. */
  shippingWaivedPaise: number;
  /** Total the customer is better off by. Reporting, not arithmetic. */
  benefitPaise: number;
}

/** Both arms are 200. See `CouponRefusedResponse`. */
export type CouponPreviewResponse = CouponPreviewOkResponse | CouponRefusedResponse;

export type CouponPreviewErrorResponse = ApiErrorResponse & {
  code: "BAD_REQUEST" | "VALIDATION_FAILED" | "DB_UNAVAILABLE" | "INTERNAL_ERROR";
};

// ---------------------------------------------------------------------------
// GET /api/serviceability?pincode=
// ---------------------------------------------------------------------------

/**
 * Mirrors `ServiceabilityCode` in `@ekmool/core`; re-declared for the
 * reason given at `OrderStatus`.
 *
 * `UNASSIGNED` and `ARMY_POSTAL` are answers, not failures — a PIN code
 * starting 9 is a real, deliverable address that our couriers do not reach,
 * and the message says so. Only `INVALID_FORMAT` carries a 4xx.
 */
export type ServiceabilityCode = "OK" | "INVALID_FORMAT" | "UNASSIGNED" | "ARMY_POSTAL";

export type DeliveryZoneId = "metro" | "standard" | "extended";

export interface DeliveryZoneDto {
  id: DeliveryZoneId;
  /** The exact wording used on /shipping-policy. Kept identical on purpose. */
  label: string;
  /** Working days in transit, after dispatch — not the figure to show. */
  minDays: number;
  maxDays: number;
}

/**
 * The normal reply, at 200 (or 400 for `INVALID_FORMAT`). Structurally the
 * `ServiceabilityResult` the checker returns, serialised unchanged.
 *
 * The top-level `minDays`/`maxDays` include the dispatch day and are the
 * ones to show a customer; `zone.minDays`/`zone.maxDays` are transit only.
 * Showing the zone's figures would quote a delivery a day early.
 */
export interface ServiceabilityResultResponse {
  code: ServiceabilityCode;
  /** Whitespace stripped. Echoed back so a client can confirm what was read. */
  pincode: string;
  /** Null unless `code` is OK. */
  circle: string | null;
  zone: DeliveryZoneDto | null;
  /** Total working days from order confirmation, dispatch included. Null unless OK. */
  minDays: number | null;
  maxDays: number | null;
  message: string;
}

/**
 * The over-long-parameter guard, at 400, before the checker runs.
 *
 * It is `{ code, message }` and **nothing else** — no `pincode`, no `zone`,
 * no nulls — so it is not a `ServiceabilityResultResponse` despite carrying
 * the same code. A client that reads `.pincode` off a serviceability reply
 * gets `undefined` here. Typed separately rather than making six fields
 * optional on the main DTO, which would push the check onto every caller
 * for the sake of one guard clause.
 */
export interface ServiceabilityRejectedResponse {
  code: "INVALID_FORMAT";
  message: string;
}

export type ServiceabilityResponse =
  | ServiceabilityResultResponse
  | ServiceabilityRejectedResponse;
