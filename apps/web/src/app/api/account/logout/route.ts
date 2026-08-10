import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";
import { hasClerk } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST only. A GET would let any page on the internet sign a customer out
 * with an <img> tag — harmless but rude, and trivial to prevent.
 *
 * ---
 *
 * **Signing out of a bearer session.**
 *
 * A native client has no cookie for `clearSession` to clear, and this
 * endpoint does not revoke its token. That is a decision, not a gap: the
 * token is stateless by design — it is a signature over an email and an
 * expiry, verified with `SESSION_SECRET` and nothing else, which is exactly
 * why the account area survives a database outage and why two instances can
 * read each other's sessions without sharing anything but that secret.
 *
 * The rejected alternative is a revocation list. It would be the first
 * piece of session state in a system that has none, and it would have to
 * live somewhere: in MySQL, and signing out stops working when the database
 * does, while every authenticated request grows a query; in Redis, and it
 * silently degrades to nothing when `REDIS_URL` is unset, which is a
 * sign-out that reports success and does not happen. Both trade a real
 * property for a token that is thirty days from expiring anyway.
 *
 * So sign-out on a phone is deleting the keystore entry, and the honest
 * scope of that is: the token is gone from the device, and it would still
 * be accepted by the server if someone had already copied it off the
 * device. The endpoint still succeeds — the app calls it, and it still
 * revokes the Clerk session below, which *is* server-side state.
 *
 * The request is not read at all, hence no parameter: there is nothing
 * useful to do with a bearer token here, and reading one only to ignore it
 * would suggest otherwise.
 */
export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
  clearSession(response);

  // There are two ways into an account and clearing the cookie ends only
  // one of them: getCustomerEmail falls back to a verified Clerk email, so
  // a customer who signed in through Clerk stayed signed in after being
  // told they had signed out. The cookie went, the Clerk session did not,
  // and /account kept rendering — on what may be a shared machine.
  //
  // Revoked server-side rather than through Clerk's client SDK, which
  // would need ClerkProvider mounted over /account and put Clerk's client
  // JS on pages that have no script budget for it. Clerk has no hosted
  // sign-out page to redirect to either — /sign-out is a 404, measured.
  if (hasClerk) {
    try {
      const { auth, clerkClient } = await import("@clerk/nextjs/server");
      const { sessionId } = await auth();
      if (sessionId) {
        const client = await clerkClient();
        await client.sessions.revokeSession(sessionId);
      }
    } catch (error) {
      // The cookie is already cleared on `response`, so a customer who
      // signed in by order lookup is signed out regardless. Failing the
      // whole request here would turn a partial sign-out into none.
      console.error("[account] Clerk session revoke failed:", error);
    }
  }

  return response;
}
