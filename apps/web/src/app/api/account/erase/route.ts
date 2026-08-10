import { NextResponse, type NextRequest } from "next/server";
import { getCustomerEmail } from "@/lib/account";
import { eraseCustomer } from "@/db/queries/privacy";
import { clearSession } from "@/lib/session";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DPDP s.12 — the right to erasure.
 *
 * Two guards, both deliberate:
 *
 *  1. **The session, not a parameter.** The address erased is the one in the
 *     cookie. There is nothing in the request body naming a victim.
 *  2. **Typed confirmation.** The body must carry the exact word ERASE. A
 *     single mis-click cannot destroy someone's account, and unlike a
 *     confirm dialog this survives a replayed request.
 *
 * What happens is anonymisation, not deletion — orders are financial
 * records with a statutory retention period. `eraseCustomer` documents why
 * at length. The response says so plainly rather than claiming everything
 * was destroyed, because telling someone their data is gone when the row is
 * still there would be the actual violation.
 */
export async function POST(request: NextRequest) {
  const email = await getCustomerEmail();
  if (!email) {
    return NextResponse.json(
      { error: "Sign in at /track first.", code: "NOT_SIGNED_IN" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const confirmation = (body as { confirm?: unknown } | null)?.confirm;
  if (confirmation !== "ERASE") {
    return NextResponse.json(
      {
        error: 'Type ERASE to confirm. Nothing has been changed.',
        code: "CONFIRMATION_REQUIRED",
      },
      { status: 400 },
    );
  }

  try {
    const result = await eraseCustomer(email);

    const response = NextResponse.json(
      {
        ok: true,
        ...result,
        message:
          "Your account, saved addresses, saved items, reviews, newsletter subscription and any back-in-stock requests are gone. Past orders remain as anonymous records — tax law requires the transactions to be kept — but they no longer carry your name, email, phone or street address.",
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );

    // The session named an address that no longer exists. Leaving the
    // cookie set would strand them on a page that redirects for ever.
    clearSession(response);
    return response;
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[account/erase] database unavailable:", error);
      return NextResponse.json(
        {
          error:
            "We could not complete the erasure just now, and nothing has been changed. Please try again shortly.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    console.error("[account/erase] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Nothing has been changed.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
