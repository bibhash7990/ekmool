import { NextResponse, type NextRequest } from "next/server";
import { sessionRequestSchema } from "@ekmool/contracts/session";
import { findOrdersByRef } from "@/db/queries/orders";
import { timingSafeEquals } from "@/lib/crypto";
import { signSession, verifySession } from "@/lib/session";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The bearer door into an account, for a client with no cookie jar.
 *
 * The proof is exactly the proof /api/account/lookup asks a browser for:
 * the eight-character reference printed on the confirmation, plus the
 * address the order was placed with. What is handed back differs only in
 * transport — the same `<base64url payload>.<hex hmac>` token the cookie
 * carries, in the body, for the app to put in its keystore and send as
 * `Authorization: Bearer …`. One signature, one secret, one expiry rule.
 *
 * Enumeration resistance is copied from lookup rather than re-derived,
 * because it is the property that matters here and re-deriving it is how it
 * comes out subtly weaker:
 *
 *  1. Rate limited in src/lib/rate-limit.ts, as tightly as lookup is and
 *     for the same reason — it is the one route here that is guessable in
 *     principle.
 *  2. One response for every failure — same status, same words — so a
 *     prober cannot learn that a reference exists by supplying the wrong
 *     email for it.
 *  3. Constant-time comparison, including against a decoy when no order
 *     matched at all, so a miss costs what a hit costs.
 *
 * ---
 *
 * **Why handing the token to a client in a JSON body is safe here.**
 *
 * `httpOnly` earns its keep by keeping a token away from JavaScript that an
 * XSS injected. Putting the same token in a response body looks like giving
 * that up, and it would be — if this token could be obtained by asking.
 * It cannot. Minting one requires the order reference *and* the email, and
 * an attacker with script execution on our origin has neither. They would
 * have to phish them, and an attacker who can phish an order reference and
 * an email address does not need the XSS: they can call this endpoint from
 * anywhere.
 *
 * What this route must therefore never do is return a token for a session
 * that already exists. **It does not read the session cookie and it does
 * not set one.** There is no "exchange my cookie for a token" endpoint, and
 * adding one later is the specific mistake this paragraph exists to
 * prevent: such an endpoint would be callable by injected script with no
 * proof at all, and would convert every XSS into a thirty-day credential
 * that survives the page being closed. Hence no `attachSession` call below,
 * and no `Set-Cookie` on any response this file produces.
 *
 * ---
 *
 * The matching logic below is **duplicated** from /api/account/lookup, not
 * shared with it. The two are twenty similar lines, and the properties that
 * make them correct are timing and response-shape properties that
 * `test:account` and `test:consent` assert byte-for-byte against lookup. A
 * shared helper would make every future edit to the app's door an edit to
 * the browser's door as well, and the cost of getting that wrong — an
 * oracle, discovered by nobody — is far higher than the cost of two copies.
 * If you change one, read the other.
 */

/** Burns a comparison against a decoy so a miss costs what a hit costs. */
const DECOY_EMAIL = "no-such-customer@ekmool.invalid";

const FAILURE = {
  error:
    "We could not match that order reference and email address. Check both against your confirmation email — the reference is the 8 characters after the #.",
  code: "LOOKUP_FAILED",
} as const;

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body", code: "BAD_REQUEST" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  // No verifyChallenge here, and that is deliberate rather than an
  // oversight. Turnstile needs a widget, the honeypot needs a form to hide
  // a field in, and the timing check needs a timestamp the client did not
  // choose; a native client has none of the three. What is left protecting
  // this endpoint is the rate limiter and the fact that the proof cannot be
  // guessed at any rate the limiter permits. The rejected alternative was a
  // challenge the phone fakes its way through — a timestamp it chose and an
  // empty honeypot field it never rendered — which passes the check and
  // protects nothing, while making the code read as though it did. See
  // docs/mobile/phase-2-mobile-api.md §4.
  const parsed = sessionRequestSchema.safeParse(payload);
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
      { status: 422, headers: { "cache-control": "no-store" } },
    );
  }

  const { reference, email } = parsed.data;
  const submitted = email.trim().toLowerCase();

  try {
    // A full ULID was pasted out of a link: look it up by its last eight
    // characters — the indexed column — and then insist on the whole thing,
    // so a partial match on the reference is not a match on the id.
    const candidates =
      reference.length === 26
        ? (await findOrdersByRef(reference.slice(-8))).filter((c) => c.id === reference)
        : await findOrdersByRef(reference);

    let matched = false;
    for (const candidate of candidates) {
      if (timingSafeEquals(candidate.email.toLowerCase(), submitted)) {
        matched = true;
      }
    }
    if (candidates.length === 0) {
      timingSafeEquals(DECOY_EMAIL, submitted);
    }

    if (!matched) {
      return NextResponse.json(FAILURE, {
        status: 404,
        headers: { "cache-control": "no-store" },
      });
    }

    const token = signSession(submitted);

    // Read the expiry back out of the token we just signed rather than
    // recomputing it from Date.now() and the max age. Two derivations of one
    // number drift the moment either side is edited, and the number the
    // client schedules its re-authentication against has to be the number
    // inside the credential. verifySession cannot return null for a token
    // signed one line above, so the fallback is unreachable arithmetic — it
    // exists only because the type says it could be.
    const expiresAt = verifySession(token)?.expiresAt ?? Math.floor(Date.now() / 1000);

    // Note what is absent: no attachSession. See the header comment.
    return NextResponse.json(
      { token, email: submitted, expiresAt },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[v1/session] database unavailable:", error);
      return NextResponse.json(
        {
          error: "Order lookup is unavailable just now. Please try again shortly.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }

    console.error("[v1/session] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
