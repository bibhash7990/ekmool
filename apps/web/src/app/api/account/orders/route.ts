import { NextResponse } from "next/server";
import { getCustomerEmail } from "@/lib/account";
import { listOrdersByEmail } from "@/db/queries/account";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Order history as JSON, for a client that cannot read the server-rendered
 * /account page.
 *
 * The web account area calls `listOrdersByEmail` straight from the page, so
 * until now the phone had no way to read what the browser reads. This is the
 * same query behind a route handler — not a leaner one written for mobile,
 * for the reason the catalogue documents are shared too: a second query is a
 * second place for "which orders are yours" to be answered, and the two
 * answers only have to agree until one of them is edited.
 *
 * Scoped to the email inside the session and nothing else. There is no
 * `?email=` and there must never be one — `getCustomerEmail(request.headers)`
 * is the single identity funnel the wishlist, export and erase routes come
 * through, and passing the headers is what opens the bearer door as well as
 * the cookie one.
 */

/** One person's order history. Never a shared cache, on any status. */
const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(request: Request) {
  const email = await getCustomerEmail(request.headers);
  if (!email) {
    // The same refusal /api/account/wishlist gives, word for word and code
    // for code. A native client switches on `code`, and two spellings of
    // "you are not signed in" across the account area would mean the app
    // handling one of them by accident.
    return NextResponse.json(
      { error: "Not signed in", code: "NO_SESSION" },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const orders = await listOrdersByEmail(email);

    return NextResponse.json(
      {
        orders: orders.map((order) => ({
          id: order.id,
          status: order.status,
          totalPaise: order.totalPaise,
          itemCount: order.itemCount,
          // ISO 8601, because JSON has no date type and a client that has to
          // guess the format guesses wrong once.
          //
          // `.toISOString()` is safe here only because `listOrdersByEmail` is
          // NOT wrapped in `unstable_cache` — this is per-customer data, so
          // there is nothing to cache — and what mysql2 hands back is a live
          // Date. Wrapping it later would break this line specifically:
          // unstable_cache stores `JSON.stringify(result)` and returns
          // `JSON.parse(...)` on a hit, so a warm read yields the ISO string
          // while the declared type still says Date, and this throws
          // "toISOString is not a function" about an hour after the entry
          // filled. That is the exact bug already found and fixed in
          // db/queries/reviews.ts — see the note on `getProductReviews`. If
          // this ever needs caching, revive the Date in the query the way
          // that file does; do not defend against it here with
          // `new Date(order.createdAt)`, which hides the type lie rather
          // than fixing it and leaves the next reader believing the type.
          createdAt: order.createdAt.toISOString(),
        })),
      },
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[account/orders] database unavailable:", error);
      return NextResponse.json(
        {
          error: "Your orders are unavailable just now. Please try again shortly.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503, headers: NO_STORE },
      );
    }

    console.error("[account/orders] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500, headers: NO_STORE },
    );
  }
}
