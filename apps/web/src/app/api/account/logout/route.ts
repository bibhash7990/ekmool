import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";
import { hasClerk } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST only. A GET would let any page on the internet sign a customer out
 * with an <img> tag — harmless but rude, and trivial to prevent.
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
