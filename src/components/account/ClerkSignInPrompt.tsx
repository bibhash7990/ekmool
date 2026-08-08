import { appUrl, clerkSignInUrl } from "@/lib/env";
import { SoilLine } from "@/components/ui/SoilLine";

/**
 * The second way in, offered beside the order lookup.
 *
 * getCustomerEmail already accepts a verified Clerk email in place of a
 * lookup session — customers are keyed on email, so signing in with the
 * address you ordered with identifies exactly the same customer. That
 * path existed and worked; nothing on the page mentioned it, so the only
 * visible way back into an account was quoting an eight-character
 * reference from an email, which is not something anyone remembers.
 *
 * Renders nothing without Clerk, so the zero-third-party-key deployment
 * sees the lookup alone and no dead link. That is also why this is a
 * server component: `hasClerk` is a server-side flag, and putting the
 * check here keeps it out of the client bundle entirely.
 *
 * This is NOT registration, and rule 7 still holds: checkout never asks
 * for it, an order placed as a guest is reachable by lookup exactly as
 * before, and nothing here is required to buy anything.
 */
export function ClerkSignInPrompt() {
  if (!clerkSignInUrl) return null;

  return (
    <>
      <SoilLine align="left" className="my-10 max-w-xs" />

      <h2 className="font-display text-26 text-ek-green-900">
        Or sign in with your email
      </h2>
      <p className="mt-3 max-w-[54ch] text-15 text-ek-green-700">
        If you have signed in here before, use the same email address you
        ordered with and your orders will be waiting — no reference needed.
      </p>
      {/*
        Clerk's hosted sign-in, not a route of our own. There is no
        /sign-in page in this app — the admin area reaches Clerk the same
        way — and adding one would mean mounting ClerkProvider outside
        /admin, which would put Clerk's client JS on public pages and cost
        the script budget rule 8 protects.

        A plain <a>: this leaves the origin, so Link's prefetching and
        client navigation buy nothing.
      */}
      <a
        href={`${clerkSignInUrl}?redirect_url=${encodeURIComponent(`${appUrl}/account`)}`}
        className="mt-5 inline-flex min-h-11 items-center rounded-xs border border-ek-green-900 px-5 text-15 text-ek-green-900 transition-colors hover:bg-ek-green-900 hover:text-ek-cream"
      >
        Sign in with email
      </a>
    </>
  );
}
