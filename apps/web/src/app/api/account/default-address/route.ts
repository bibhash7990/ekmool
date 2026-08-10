import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCustomerByEmail, getDefaultAddress } from "@/db/queries/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in customer's default address, for prefilling checkout.
 *
 * Fetched by the client rather than rendered into the page on purpose:
 * /checkout is statically generated, and reading a cookie during its render
 * would make every checkout page view an origin request. Only customers who
 * actually have a session pay for this call.
 *
 * Returns 200 with `{ address: null }` rather than 404 when there is no
 * session or no saved address — the caller wants to know "is there one",
 * and an error status for the ordinary case is noise in the console.
 */
export async function GET() {
  const session = await getSession();
  const empty = NextResponse.json(
    { address: null },
    { headers: { "cache-control": "no-store" } },
  );
  if (!session) return empty;

  try {
    const customer = await getCustomerByEmail(session.email);
    if (!customer) return empty;

    const address = await getDefaultAddress(customer.id);
    if (!address) return empty;

    return NextResponse.json(
      {
        address: {
          line1: address.line1,
          line2: address.line2 ?? "",
          city: address.city,
          state: address.state,
          pincode: address.pincode,
          landmark: address.landmark ?? "",
        },
        customer: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // Prefill is a convenience. A database wobble must never stop someone
    // typing their address in and buying something.
    console.error("[account/default-address] lookup failed:", error);
    return empty;
  }
}
