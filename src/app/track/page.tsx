import type { Metadata } from "next";
import Link from "next/link";

import { getSession } from "@/lib/session";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { TrackOrderForm } from "@/components/account/TrackOrderForm";
import { turnstileSiteKey } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your order",
  description:
    "Find an Ekmool order with the reference from your confirmation and the email address you ordered with. No account needed.",
  robots: { index: false, follow: false },
};

/**
 * The door. Order history, profile and addresses live behind it at
 * /account; this page does one thing, which is turn a reference and an
 * email into a session. It stays useful when already signed in, because
 * looking up an order placed under a different address is how you switch
 * to that account.
 */
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const session = await getSession();

  return (
    <div className="mx-auto max-w-[860px] px-5 py-16 lg:py-24">
      <Eyebrow>Your orders</Eyebrow>
      <h1 className="mt-5 font-display text-46 text-ek-green-900">
        Find your order.
      </h1>

      {session ? (
        <p className="mt-5 max-w-[54ch] text-17 text-ek-green-700">
          You are signed in as <strong>{session.email}</strong> —{" "}
          <Link href="/account" className="link-draw text-ek-green-900">
            go to your account
          </Link>
          . Looking for an order placed with a different email? Enter it
          below and that address becomes the one you are signed in with.
        </p>
      ) : (
        <p className="mt-5 max-w-[54ch] text-17 text-ek-green-700">
          There is no account to sign into and no password to remember. Give
          us the reference from your confirmation and the email you ordered
          with, and everything you have bought from us is there.
        </p>
      )}

      <SoilLine align="left" className="my-10 max-w-xs" />

      <TrackOrderForm
        initialReference={ref ?? ""}
        autoFocus={!ref}
        turnstileSiteKey={turnstileSiteKey}
      />

      <p className="mt-10 max-w-[52ch] text-15 text-ek-green-700">
        Lost the confirmation email? Check your spam folder first — then{" "}
        <Link href="/contact" className="link-draw text-ek-green-900">
          get in touch
        </Link>{" "}
        with the name and mobile number you ordered with and we will find it
        for you.
      </p>
    </div>
  );
}
