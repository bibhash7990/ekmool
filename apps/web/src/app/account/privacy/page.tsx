import type { Metadata } from "next";
import Link from "next/link";
import { requireAccount } from "@/lib/account";
import { PrivacyControls } from "@/components/account/PrivacyControls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your data",
  robots: { index: false, follow: false },
};

export default async function AccountPrivacyPage() {
  const { email } = await requireAccount();

  return (
    <section aria-labelledby="privacy-heading">
      <h2 id="privacy-heading" className="font-display text-34 text-ek-green-900">
        Your data
      </h2>
      <p className="mt-4 max-w-[62ch] text-17 text-ek-green-700">
        The Digital Personal Data Protection Act 2023 gives you the right to
        see what we hold about you and to have it erased. Both are below, and
        both work immediately — there is no form to submit and no one to wait
        for.
      </p>

      <div className="mt-10 max-w-[62ch]">
        <h3 className="font-display text-20 text-ek-green-900">
          What we hold about {email}
        </h3>
        <ul className="mt-4 flex flex-col gap-2 text-17 text-ek-green-700">
          <li>
            Your name, email, phone number and whether you asked for our
            occasional emails.
          </li>
          <li>Any addresses you saved, which are only ever used to fill in a checkout.</li>
          <li>
            Your orders — what was bought, what was paid, where it was sent
            and what happened to it.
          </li>
          <li>A record of the emails we sent you about those orders.</li>
        </ul>
        <p className="mt-4 text-17 text-ek-green-700">
          We hold nothing else. There is no advertising profile, no data sold
          or shared, and analytics only runs if you said yes — you can change
          that at the bottom of any page. The{" "}
          <Link href="/privacy-policy" className="link-draw text-ek-green-900">
            privacy policy
          </Link>{" "}
          sets out the detail.
        </p>
      </div>

      <PrivacyControls email={email} />
    </section>
  );
}
