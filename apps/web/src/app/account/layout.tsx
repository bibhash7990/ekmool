import type { Metadata } from "next";
import Link from "next/link";

import { requireAccount } from "@/lib/account";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SignOutButton } from "@/components/account/SignOutButton";
import { AccountNav } from "@/components/account/AccountNav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

/**
 * The account area. No auth provider is involved: requireAccount reads the
 * signed session set at /track and redirects there when there is none, so
 * this works on a deployment with no third-party keys at all.
 *
 * It used to 404 outright unless Clerk was configured, which meant the
 * link existed in nobody's navigation and the page had never been seen by
 * a customer.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email, customer } = await requireAccount();
  const firstName = customer?.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-[980px] px-5 py-12 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <Eyebrow>Your account</Eyebrow>
          <p className="mt-4 font-display text-26 text-ek-green-900">
            {firstName ? `${firstName} · ` : ""}
            <span className="text-17 text-ek-green-700">{email}</span>
          </p>
        </div>
        <SignOutButton />
      </div>

      <AccountNav />

      <div className="mt-10">{children}</div>

      <p className="mt-16 max-w-[56ch] text-15 text-ek-green-700">
        Signed in with an order reference — there is no password on this
        account and nothing to forget. Ordered with a different email?{" "}
        <Link href="/track" className="link-draw text-ek-green-900">
          Look that order up
        </Link>{" "}
        and it becomes the account you are signed in to.
      </p>
    </div>
  );
}
