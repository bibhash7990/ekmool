import { NextResponse } from "next/server";
import { savedAddressSchema } from "@ekmool/contracts/account";
import { getCustomerEmail } from "@/lib/account";
import {
  createAddress,
  getCustomerByEmail,
  listAddresses,
  MAX_ADDRESSES,
  TooManyAddressesError,
  type CustomerAddress,
} from "@/db/queries/customers";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saved addresses as JSON, for a client with no forms to post.
 *
 * The web edits these through server actions in src/app/account/actions.ts.
 * A native client cannot call a server action, so this exposes the two verbs
 * the app's address screen needs — read the list, add one — over the same
 * query functions and the same Zod schema. Editing, deleting and changing
 * the default are deliberately not here: the phone's Phase 4 screen lists
 * and adds, and a route nobody calls is a surface nobody is testing.
 *
 * No SQL is written in this file. Route handlers validate and call a query
 * function; the queries in db/queries/customers.ts put `customer_id` in
 * every WHERE clause, which is what makes "you can only touch your own" a
 * property of the query rather than of this handler remembering.
 *
 * The customer is resolved from the session — cookie or bearer, through
 * `getCustomerEmail(request.headers)` — and never from the body. There is no
 * customerId field to send, which is the only reliable way one person cannot
 * write into another's address book.
 */

/** One person's address book. Never a shared cache, on any status. */
const NO_STORE = { "cache-control": "no-store" } as const;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * The signed-in customer's row id, or the response to send instead.
 *
 * Mirrors `resolveCustomerId` in the wishlist route, including the part that
 * looks over-strict: a session whose customer row is gone — a DPDP erasure,
 * or an admin deletion — is answered as 401 rather than as an empty list.
 * A 200 saying "no addresses" reads to a client as "I looked, and there are
 * none", and the address screen would then offer to add one into an account
 * that no longer exists. The wishlist learned this the expensive way; the
 * comment there is worth reading before changing it here.
 */
async function resolveCustomer(
  headers: Headers,
): Promise<{ id: number } | { response: NextResponse }> {
  const email = await getCustomerEmail(headers);
  if (!email) {
    return {
      response: json({ error: "Not signed in", code: "NO_SESSION" }, 401),
    };
  }

  const customer = await getCustomerByEmail(email);
  if (!customer) {
    return {
      response: json({ error: "Not signed in", code: "NO_SESSION" }, 401),
    };
  }

  return { id: customer.id };
}

function failure(error: unknown): NextResponse {
  if (
    error instanceof DbUnconfiguredError ||
    (error instanceof Error && "code" in error)
  ) {
    console.error("[account/addresses] database unavailable:", error);
    return json(
      {
        error: "Your saved addresses are unavailable just now. Please try again shortly.",
        code: "DB_UNAVAILABLE",
      },
      503,
    );
  }

  console.error("[account/addresses] unexpected failure:", error);
  return json(
    { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
    500,
  );
}

/**
 * Serialised field by field rather than by spreading the row.
 *
 * `CustomerAddress` is already exactly the wire shape today, so a spread
 * would be shorter and would also mean that the next column added to
 * `customer_addresses` — and put on that interface — ships to every client
 * silently. An address book is the one table here that holds a stranger's
 * home, so the list of fields that leave the server is written out.
 */
function toWire(address: CustomerAddress) {
  return {
    id: address.id,
    label: address.label,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    landmark: address.landmark,
    isDefault: address.isDefault,
  };
}

export async function GET(request: Request) {
  try {
    const resolved = await resolveCustomer(request.headers);
    if ("response" in resolved) return resolved.response;

    const addresses = await listAddresses(resolved.id);
    return json({ addresses: addresses.map(toWire) }, 200);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Malformed JSON body", code: "BAD_REQUEST" }, 400);
  }

  // The same schema the web's saveAddressAction uses, and through it the same
  // address rules checkout enforces — so an address saved from the phone is
  // by construction one checkout will accept. The client may validate with
  // it too, for the message; this is the decision.
  const parsed = savedAddressSchema.safeParse(payload);
  if (!parsed.success) {
    return json(
      {
        error: "Please check the highlighted fields",
        code: "VALIDATION_FAILED",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      422,
    );
  }

  try {
    const resolved = await resolveCustomer(request.headers);
    if ("response" in resolved) return resolved.response;

    const id = await createAddress(resolved.id, parsed.data);

    // The new id AND the list as it now stands, in one reply.
    //
    // Not the id alone: `createAddress` makes the first address saved the
    // default whether or not `isDefault` was asked for, and saving one with
    // `isDefault: true` clears the flag on another row. A client that
    // appended what it sent would be showing two defaults, or none, until
    // something else refetched. The rejected alternative was to answer with
    // the id and let the app fetch the list again — one more round trip on a
    // phone network to learn something the server already had in hand.
    const addresses = await listAddresses(resolved.id);
    return json({ id, addresses: addresses.map(toWire) }, 201);
  } catch (error) {
    if (error instanceof TooManyAddressesError) {
      // VALIDATION_FAILED, and no `issues`: the cap is a rule about the
      // collection, not about a field, so there is nothing to highlight.
      //
      // The honest code would be a new TOO_MANY_ADDRESSES, and it is not
      // invented here — @ekmool/contracts/errors is the vocabulary a shipped
      // app switches on, and a client compiled before the code existed would
      // fall through to its default branch. The `error` string already names
      // the rule and the number, which is what the customer needs and what
      // the design system asks for; adding the code belongs in the commit
      // that also teaches the app to read it.
      return json(
        {
          error: `You can keep up to ${MAX_ADDRESSES} addresses. Delete one you no longer use first.`,
          code: "VALIDATION_FAILED",
        },
        422,
      );
    }
    return failure(error);
  }
}
