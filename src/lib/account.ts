import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { hasClerk } from "@/lib/env";
import { getCustomerByEmail, type Customer } from "@/db/queries/customers";

/**
 * Who is looking at the account area.
 *
 * Two doors, one room. The /track session cookie is the primary one and
 * works with no third-party service at all. Clerk, when it happens to be
 * configured, is accepted as a second — a Clerk account's verified email
 * identifies exactly the same customer, because customers are keyed on
 * email. Neither is required for anything else on the site.
 */
export async function getCustomerEmail(): Promise<string | null> {
  const session = await getSession();
  if (session) return session.email;

  if (!hasClerk) return null;

  try {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    // Only a verified address may stand in for a session. An unverified
    // one is a claim, not a fact.
    if (email && user?.primaryEmailAddress?.verification?.status === "verified") {
      return email.toLowerCase();
    }
  } catch (error) {
    console.error("[account] Clerk lookup failed:", error);
  }

  return null;
}

export interface AccountContext {
  email: string;
  /**
   * Null only in the edge case where a session outlives its customer row —
   * an admin deletion, or a DPDP erasure request. Callers that need the
   * numeric id (addresses) must handle it; callers that work off the email
   * (orders) do not.
   */
  customer: Customer | null;
}

/**
 * Resolves the account or sends the visitor to the door. Every page under
 * /account calls this; nothing under /account may read a customer's data
 * any other way.
 */
export async function requireAccount(): Promise<AccountContext> {
  const email = await getCustomerEmail();
  if (!email) redirect("/track");

  // A database outage must not turn the account area into a 500. The
  // session is proof enough of who this is; pages degrade to saying they
  // could not load the details.
  try {
    return { email, customer: await getCustomerByEmail(email) };
  } catch (error) {
    console.error("[account] customer lookup failed:", error);
    return { email, customer: null };
  }
}
