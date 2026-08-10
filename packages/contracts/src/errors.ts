/**
 * Every `code` this API puts on a failure response, in one list.
 *
 * Why this file exists: a client that switches on string literals it
 * inferred by reading the server source is a client that breaks silently
 * when one of them is renamed. Nothing fails to compile, nothing throws —
 * the `case "COUPON_REFUSED"` arm simply stops matching and the customer
 * gets the default branch. The mobile app switches on these, and it ships
 * on a release cycle the server does not control, so the vocabulary has to
 * be a declared thing that both sides import rather than a convention.
 *
 * **Codes live here; the sentences do not.** No copy in this package, ever.
 * A refusal has to name the rule that refused it — "That code needs a
 * basket of at least ₹500", not "Invalid code" — and that wording is
 * composed on the server from the reason *plus its threshold*
 * (`couponRefusalMessage`, in `@ekmool/core`). A copy of the sentence in
 * here could not see the threshold, so it would have to be vaguer than the
 * real one, and the vaguer version is exactly the one the design system
 * forbids. Split deliberately: the code says which rule, the server says it
 * in words, the client renders those words.
 *
 * This list is derived from the handlers as they actually are, not from
 * what a design document assumed. Adding a code to a handler without adding
 * it here means the response is no longer describable by this package.
 */

/**
 * Codes that appear alongside an `error` string. Grouped by what the caller
 * can do about them, because that is how a client's switch is written.
 */
export const API_ERROR_CODES = [
  // --- the request itself ------------------------------------------------
  /** Body was not JSON, or a path/query parameter was unusable. */
  "BAD_REQUEST",
  /** POST /api/checkout without an `Idempotency-Key` of 8+ characters. */
  "IDEMPOTENCY_KEY_REQUIRED",
  /** Zod rejected the body. Carries `issues` on most routes — see responses.ts. */
  "VALIDATION_FAILED",
  /** A PIN code that is not six digits. Only /api/serviceability sends it. */
  "INVALID_FORMAT",
  /** Turnstile or the honeypot refused. Deliberately shaped like any other 400. */
  "CHALLENGE_FAILED",
  /** 429 from the rate limiter in proxy.ts, never from a handler. */
  "RATE_LIMITED",

  // --- who is asking -----------------------------------------------------
  /** No session cookie. Wishlist and reviews. */
  "NO_SESSION",
  /** No session cookie. Account erase and export say it in these words. */
  "NOT_SIGNED_IN",
  /** Reading an order needs only the link; acting on one needs a session. */
  "VERIFICATION_REQUIRED",
  /** Erasure was not confirmed with the literal word ERASE. */
  "CONFIRMATION_REQUIRED",
  /**
   * Order lookup failed. One code for a wrong reference, a wrong email and
   * a tripped honeypot alike — three codes would be an enumeration oracle.
   */
  "LOOKUP_FAILED",
  /** No such order, or one that is not the session's. Same code for both. */
  "NOT_FOUND",

  // --- the catalogue and the shelf ---------------------------------------
  "UNKNOWN_VARIANT",
  /** Checkout only. Carries `sku` and `available`. */
  "INSUFFICIENT_STOCK",
  /**
   * A back-in-stock request for something already back. Good news, sent as
   * a 409 with an `error` — so it is an error code by shape even though it
   * is the outcome the customer wanted.
   */
  "IN_STOCK",

  // --- coupons -----------------------------------------------------------
  /**
   * Carries `reason`. Note the status is *not* uniform: checkout sends 409,
   * /api/coupons/preview sends it with 200, because a quote that says no is
   * still a successful quote.
   */
  "COUPON_REFUSED",

  // --- an order's own lifecycle ------------------------------------------
  // Cancellation and returns both derive the code from the refusal reason
  // (`result.reason.toUpperCase()`), so these are the CancelRefusal and
  // ReturnRefusal unions upper-cased. That derivation is why they are easy
  // to miss when reading for `code: "` and why they are listed explicitly.
  "NOT_YOURS",
  "ALREADY_CANCELLED",
  "TOO_LATE",
  "PREPAID",
  "NOT_DELIVERED",
  "WINDOW_CLOSED",
  "ALREADY_REQUESTED",

  // --- reviews -----------------------------------------------------------
  "NOT_ELIGIBLE",
  "ALREADY_REVIEWED",

  // --- integrations that may not be configured ---------------------------
  /** Razorpay chosen at checkout with no keys. COD is still available. */
  "RAZORPAY_NOT_CONFIGURED",
  /** The Razorpay webhook, with no keys. Distinct wording, distinct code. */
  "NOT_CONFIGURED",
  "INVALID_SIGNATURE",

  // --- ours, not theirs --------------------------------------------------
  "DB_UNAVAILABLE",
  "INTERNAL_ERROR",
  /**
   * The cron endpoints under /api/jobs. Not reachable by an app — kept here
   * because the point of the list is that it is complete, and a code that
   * exists but is undocumented is the one that surprises someone.
   */
  "JOB_FAILED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Codes that appear on a 2xx with no `error` field, where the body's `code`
 * is the outcome rather than a failure.
 *
 * Separate from the error list on purpose: a client that treats "did the
 * body carry a code" as "did it fail" would show COUPON_OK as a problem.
 * `REGISTERED` and `ALREADY_WAITING` come from `outcome.toUpperCase()` in
 * the back-in-stock handler.
 */
export const API_OUTCOME_CODES = [
  "COUPON_OK",
  "REGISTERED",
  "ALREADY_WAITING",
  "SUBMITTED",
] as const;

export type ApiOutcomeCode = (typeof API_OUTCOME_CODES)[number];

/** Anything this API may put in a `code` field. */
export type ApiCode = ApiErrorCode | ApiOutcomeCode;

/**
 * Narrows an unknown `code` off the wire.
 *
 * Takes `unknown` rather than `string` because the value it is given comes
 * from `JSON.parse`, where the type is a claim and not a fact.
 *
 * A `.includes` over the frozen tuple, not a `Set` built at module scope:
 * the package declares `sideEffects: false`, the lists are ~30 entries, and
 * one array literal that a bundler can shake out beats a data structure
 * built on import for a lookup that happens once per failed request.
 */
export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value)
  );
}

export function isApiOutcomeCode(value: unknown): value is ApiOutcomeCode {
  return (
    typeof value === "string" && (API_OUTCOME_CODES as readonly string[]).includes(value)
  );
}
