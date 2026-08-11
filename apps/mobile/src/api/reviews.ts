import type {
  ProductReviewsEntry,
  ReviewsDocument,
} from "@ekmool/contracts/documents";

import { apiGet, apiPost, type ApiResult } from "@/api/client";

/**
 * Reviews: reading the published ones, and writing a new one.
 *
 * ── Reading ──
 *
 * Reads come from `reviews-v1.json`, the static document
 * `src/hooks/useCachedDocument.ts` already fetches, caches and revalidates.
 * There is deliberately **no second path** to review data in this app. A
 * live `GET /api/reviews/[slug]` would be quicker to write and would undo
 * the property the document exists for: browsing never touches the database
 * (rule 8), the document keeps serving with MySQL stopped, and the phone
 * inherits that by consuming it rather than routing around it.
 *
 * ── Rule 5 is not enforced here ──
 *
 * This module hands back `ProductReviewsEntry | null` and nothing more. What
 * an unreviewed product *draws* — nothing at all, no heading, no grey marks,
 * no "0.0", no "Be the first" — is decided in
 * `src/components/reviews/ProductRating.tsx`, in one component, so there is
 * exactly one place to read and one place to check. `parseEntry` below still
 * refuses to invent a rating: a malformed or absent entry becomes `null`,
 * never `{ count: 0, average: 0 }`.
 *
 * ── Writing, and a server-side gap this client cannot close ──
 *
 * `POST /api/reviews` (and `GET /api/reviews` for eligibility) resolve the
 * customer with `getCustomerEmail()` — **called with no argument**. Read
 * `apps/web/src/lib/account.ts`: the optional `headers` parameter is what
 * opens the bearer door, and `resolveSession(undefined)` falls straight
 * through to the cookie jar. A phone has no cookie jar.
 *
 * So today both verbs answer this client `NO_SESSION`, whatever is in the
 * keystore. `/api/account/wishlist` does pass `request.headers` and works;
 * `/api/reviews` does not. The one-line fix is on the server — pass
 * `request.headers` to both calls in `apps/web/src/app/api/reviews/route.ts`
 * — and it is not made here, because a client cannot grant itself
 * eligibility and must not pretend to.
 *
 * What this module does instead is send the bearer (every request through
 * `apiPost` carries it) and report `NO_SESSION` truthfully, so the composer
 * renders the honest refusal rather than a spinner or a lie. The moment the
 * server passes its headers, this file starts working with no change.
 */

/* ------------------------------------------------------------------ */
/* Reading                                                             */

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Narrows one product's entry out of the cached document.
 *
 * The document is JSON off the wire and may be a version older than this
 * build — the `-v1` naming exists precisely so an old client keeps reading a
 * document that has gained fields. Everything below is therefore checked
 * rather than cast.
 *
 * **`rating` becomes `null` on anything doubtful**, including `count: 0`,
 * which the reader should never emit but which costs one comparison to
 * refuse. The contract's own comment says a client that renders
 * `rating.average` without the null check will crash and that this is "the
 * right direction to fail" — a crash is loud, and an invented "0.0 out of 5"
 * on a product nobody has bought is quiet and reads as real.
 */
function parseEntry(value: unknown): ProductReviewsEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;

  const reviews = Array.isArray(record.reviews)
    ? record.reviews.filter((review): review is ProductReviewsEntry["reviews"][number] => {
        if (typeof review !== "object" || review === null) return false;
        const entry = review as Record<string, unknown>;
        return (
          isFiniteNumber(entry.id) &&
          typeof entry.displayName === "string" &&
          isFiniteNumber(entry.rating) &&
          typeof entry.title === "string" &&
          typeof entry.body === "string" &&
          typeof entry.createdAt === "string"
        );
      })
    : [];

  const raw = record.rating;
  if (typeof raw !== "object" || raw === null) return { rating: null, reviews };

  const rating = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(rating.count) ||
    !isFiniteNumber(rating.average) ||
    rating.count < 1 ||
    rating.average <= 0
  ) {
    return { rating: null, reviews };
  }

  return {
    rating: { count: Math.trunc(rating.count), average: rating.average },
    reviews,
  };
}

/**
 * One product's published reviews, or `null`.
 *
 * `null` covers three cases that a screen must treat identically: the
 * document has not been downloaded yet, this phone's copy predates the
 * product, and the entry is there but unusable. All three mean "we do not
 * know of a review", and the honest rendering of that is the same as the
 * rendering of "there are none" — nothing.
 */
export function reviewsForProduct(
  document: ReviewsDocument | null,
  slug: string,
): ProductReviewsEntry | null {
  if (!document || typeof document.products !== "object" || document.products === null) {
    return null;
  }
  return parseEntry((document.products as Record<string, unknown>)[slug]);
}

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */

/**
 * The three reasons the server gives, plus nothing invented.
 *
 * `NOT_DELIVERED` is also what a failed eligibility check falls back to, on
 * the web and here: refusing to show the form is the safe direction, because
 * the POST re-checks against the session regardless and a customer who typed
 * a paragraph they were never allowed to submit has been wasted.
 */
export type ReviewBlockedReason = "NO_SESSION" | "NOT_DELIVERED" | "ALREADY_REVIEWED";

export type ReviewEligibility =
  | { eligible: true }
  | { eligible: false; reason: ReviewBlockedReason };

interface EligibilityBody {
  eligible?: unknown;
  reason?: unknown;
}

function asBlockedReason(value: unknown): ReviewBlockedReason {
  return value === "NO_SESSION" || value === "ALREADY_REVIEWED"
    ? value
    : "NOT_DELIVERED";
}

/**
 * May this customer review this product?
 *
 * Nothing on the phone decides it. The server finds a delivered order in the
 * session's own name containing the product, and there is no parameter a
 * caller can set to become a verified buyer — see the header comment on
 * `apps/web/src/app/api/reviews/route.ts`.
 *
 * The route answers 200 even for a guest (`{ eligible: false, reason:
 * "NO_SESSION" }`), so a failure here really is a failure — offline, a
 * timeout, or the database — and the caller renders the transport message
 * rather than a blocked state that would misattribute it.
 */
export async function checkReviewEligibility(
  productSlug: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<ReviewEligibility>> {
  const result = await apiGet<EligibilityBody>(
    `/api/reviews?productSlug=${encodeURIComponent(productSlug)}`,
    options,
  );
  if (!result.ok) return result;

  return {
    ok: true,
    data:
      result.data.eligible === true
        ? { eligible: true }
        : { eligible: false, reason: asBlockedReason(result.data.reason) },
  };
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */

export interface ReviewDraft {
  productSlug: string;
  /** 1–5. Zero means "not chosen yet" and never reaches the wire. */
  rating: number;
  title: string;
  body: string;
}

export interface ReviewIssue {
  /** Matches the server's `issues[].path`, so one renderer handles both. */
  path: "rating" | "title" | "body" | "productSlug";
  message: string;
}

/** The 201 body. `SUBMITTED` is an outcome code, not an error code. */
export interface ReviewSubmitted {
  code: string;
  message: string;
}

/**
 * The server's `submitSchema`, restated.
 *
 * Restated and not imported, because there is no review schema in
 * `@ekmool/contracts` to import — checkout and session have one, reviews do
 * not. That is a real duplication and the risk is real with it: if the
 * server's bounds move, these drift. The alternative was to send whatever
 * was typed and render the 422, which costs a round trip on a connection the
 * customer pays for and shows one error at a time instead of all of them.
 *
 * **The messages are the server's own wording**, copied exactly, so the two
 * clients refuse in the same words — the same mechanism `signIn` uses in
 * `src/api/session.ts`. The client validates for the message; the server
 * validates for the decision, and its answer is the only one that counts.
 */
const TITLE_MIN = 3;
const TITLE_MAX = 120;
const BODY_MIN = 20;
const BODY_MAX = 2000;

export function validateReviewDraft(draft: ReviewDraft): readonly ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const title = draft.title.trim();
  const body = draft.body.trim();

  if (!/^[a-z0-9-]{1,120}$/.test(draft.productSlug)) {
    issues.push({ path: "productSlug", message: "Unknown product" });
  }
  if (!Number.isInteger(draft.rating) || draft.rating < 1 || draft.rating > 5) {
    issues.push({ path: "rating", message: "Pick a rating to submit." });
  }
  if (title.length < TITLE_MIN) {
    issues.push({ path: "title", message: "Give it a short headline" });
  } else if (title.length > TITLE_MAX) {
    issues.push({
      path: "title",
      message: `The headline can be up to ${TITLE_MAX} characters.`,
    });
  }
  if (body.length < BODY_MIN) {
    issues.push({ path: "body", message: "A sentence or two helps the next person" });
  } else if (body.length > BODY_MAX) {
    issues.push({
      path: "body",
      message: `A review can be up to ${BODY_MAX} characters.`,
    });
  }

  return issues;
}

/**
 * ── FSSAI: no disease, cure or treatment claims, anywhere, ever ──
 *
 * This is the one screen in the app where the words are somebody else's, and
 * a food seller publishing "cured my mother's arthritis" under its own
 * product is making the claim as surely as if it had written it. The
 * moderation queue in /admin is the control that stops it — nothing reaches
 * a product page unread.
 *
 * What this function adds is a **notice, before the send**, so a reviewer
 * finds out now rather than by watching a review never appear. It is
 * advisory by construction:
 *
 *   - It never blocks the submit. A client is not the authority on what may
 *     be published, and a word list is a crude instrument — "such a treat"
 *     and "cured meat" are ordinary food English, which is exactly why
 *     `treat` and `cured` are not in the list below.
 *   - It never edits the draft. Silently rewriting what somebody wrote about
 *     a product they bought would be a worse thing to do than publishing it.
 *   - It says which rule refused and why, per the copy rule, rather than
 *     "invalid".
 *
 * Returns the sentence to show, or `null` when there is nothing to say.
 */
const HEALTH_CLAIM_TERMS =
  /\b(cure|cures|heal|heals|healing|remedy|medicinal|medicine|therapeutic|treatment|treating|detox|immunity|immune|prevents|anti-?inflammatory|inflammation|cancer|diabetes|diabetic|cholesterol|arthritis|asthma|blood pressure|weight loss)\b/i;

export function healthClaimNotice(text: string): string | null {
  if (!HEALTH_CLAIM_TERMS.test(text)) return null;
  return (
    "Food law does not allow a review on this site to say that a food " +
    "prevents, treats or cures an illness, so a review that does cannot be " +
    "published. You can still send this. What helps the next person is how " +
    "you cooked with it and how it compared to what you usually buy."
  );
}

/**
 * Sends the review. Everything lands as `pending` — nothing a stranger typed
 * appears on a product page until the owner has read it.
 *
 * The failure is a **value**, as everywhere else in this client: a 403
 * `NOT_ELIGIBLE` and a 409 `ALREADY_REVIEWED` are answers the screen renders,
 * not exceptions it catches.
 *
 * `Idempotency-Key` is deliberately not sent. It is required by
 * `POST /api/checkout` and by nothing else, and this POST is not retried —
 * `apiRequest` retries idempotent methods only, so a duplicate can arrive
 * only from a second deliberate tap, which the server already answers with
 * `ALREADY_REVIEWED`.
 */
export async function submitReview(
  draft: ReviewDraft,
): Promise<ApiResult<ReviewSubmitted>> {
  const issues = validateReviewDraft(draft);
  if (issues.length > 0) {
    // Shaped exactly like the server's 422 so the composer has one branch and
    // not two — the same trick `signIn` uses.
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: issues[0]?.message ?? "Please check the highlighted fields",
      payload: { issues },
    };
  }

  return apiPost<ReviewSubmitted>("/api/reviews", {
    productSlug: draft.productSlug,
    rating: draft.rating,
    title: draft.title.trim(),
    body: draft.body.trim(),
  });
}

/**
 * Pulls `issues` back off a `VALIDATION_FAILED` payload, whether it came from
 * `validateReviewDraft` above or from the server's Zod.
 *
 * `payload` is `unknown` on `ApiFailure` on purpose — the shape depends on
 * the code — so the narrowing belongs at the call site that knows which code
 * it asked about, which is this one.
 */
export function issuesFromFailure(payload: unknown): readonly ReviewIssue[] {
  if (typeof payload !== "object" || payload === null) return [];
  const raw = (payload as { issues?: unknown }).issues;
  if (!Array.isArray(raw)) return [];

  const paths: readonly string[] = ["rating", "title", "body", "productSlug"];
  return raw.flatMap((issue): ReviewIssue[] => {
    if (typeof issue !== "object" || issue === null) return [];
    const entry = issue as { path?: unknown; message?: unknown };
    if (typeof entry.path !== "string" || typeof entry.message !== "string") return [];
    if (!paths.includes(entry.path)) return [];
    return [{ path: entry.path as ReviewIssue["path"], message: entry.message }];
  });
}
