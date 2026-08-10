import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerEmail } from "@/lib/account";
import { getCustomerByEmail } from "@/db/queries/customers";
import {
  listWishlist,
  mergeWishlist,
  replaceWishlist,
} from "@/db/queries/wishlist";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in half of the wishlist.
 *
 * Scoped to the session email and nothing else — no customer id in the
 * body, no slug that identifies a person. A guest gets 401 and carries on
 * using the browser copy, which is the whole list as far as they are
 * concerned.
 */

const SLUG = z.string().regex(/^[a-z0-9-]{1,120}$/);

const mergeSchema = z.object({
  // Capped so a poisoned localStorage cannot turn one request into a
  // thousand-row insert.
  slugs: z.array(SLUG).max(100),
});

/**
 * Two verbs, deliberately different:
 *
 *   POST — union. Sent once, when /wishlist opens: the phone's list and
 *          the server's list are both real, so neither may delete the other.
 *   PUT  — replace. Sent afterwards, while the visitor is on /wishlist
 *          actively removing things. There, a removal is an instruction,
 *          and a union would put back exactly what they just took out.
 */
const replaceSchema = z.object({ slugs: z.array(SLUG).max(100) });

/** Resolves the session to a customer row, or the response to send back. */
async function resolveCustomerId(): Promise<
  { id: number } | { response: NextResponse }
> {
  const email = await getCustomerEmail();
  if (!email) {
    return {
      response: NextResponse.json(
        { error: "Not signed in", code: "NO_SESSION" },
        { status: 401 },
      ),
    };
  }

  const customer = await getCustomerByEmail(email);
  if (!customer) {
    // A session outliving its customer row — a DPDP erasure, or an admin
    // deletion. There is no account to sync with, so this answers exactly
    // as it does for a guest.
    //
    // It used to return 200 with an empty list, and that quietly destroyed
    // data: the client reads a 200 as "the merge ran, here is the result"
    // and replaces its own list with what came back. Someone whose account
    // had been erased lost every item they had saved since, on the next
    // visit to /wishlist, without touching anything. A response that says
    // "nothing" must never be mistaken for one that says "nothing, and I
    // considered what you sent me".
    return {
      response: NextResponse.json(
        { error: "Not signed in", code: "NO_SESSION" },
        { status: 401 },
      ),
    };
  }

  return { id: customer.id };
}

function failure(error: unknown): NextResponse {
  if (
    error instanceof DbUnconfiguredError ||
    (error instanceof Error && "code" in error)
  ) {
    console.error("[wishlist] database unavailable:", error);
    return NextResponse.json(
      { error: "Saved items are unavailable just now.", code: "DB_UNAVAILABLE" },
      { status: 503 },
    );
  }
  console.error("[wishlist] unexpected failure:", error);
  return NextResponse.json(
    { error: "Something went wrong.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const resolved = await resolveCustomerId();
    if ("response" in resolved) return resolved.response;

    return NextResponse.json(
      { slugs: await listWishlist(resolved.id) },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const parsed = mergeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  try {
    const resolved = await resolveCustomerId();
    if ("response" in resolved) return resolved.response;

    return NextResponse.json(
      { slugs: await mergeWishlist(resolved.id, parsed.data.slugs) },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const parsed = replaceSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Bad request", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  try {
    const resolved = await resolveCustomerId();
    if ("response" in resolved) return resolved.response;

    return NextResponse.json(
      { slugs: await replaceWishlist(resolved.id, parsed.data.slugs) },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
