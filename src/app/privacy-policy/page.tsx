import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/legal/PolicyPage";

export const metadata: Metadata = {
  title: "Privacy Policy — What Data Ekmool Collects & Why",
  description:
    "What personal data Ekmool collects when you order, who processes it, how long we keep it, what we deliberately do not collect, and how to have your data erased.",
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPolicy() {
  return (
    <PolicyPage
      href="/privacy-policy"
      label="Privacy Policy"
      title="Privacy Policy"
      standfirst="What we collect, why we need it, who else sees it, and how to get it deleted. Written to be read rather than skimmed past."
      updated="4 August 2026"
    >
      <PolicySection heading="What we collect">
        <p>When you place an order we collect:</p>
        <ul>
          <li>Your name, email address and mobile number</li>
          <li>The delivery address you give us, including PIN code</li>
          <li>What you ordered, and the amount paid</li>
          <li>Any note you add to the order</li>
        </ul>
        <p>
          We ask for this because we cannot deliver a parcel or send you a
          receipt without it. There is no optional profiling data on our
          checkout form.
        </p>
      </PolicySection>

      <PolicySection heading="What we deliberately do not collect">
        <ul>
          <li>
            <strong>Card details.</strong> Online payments are handled entirely
            by Razorpay. Card numbers, CVVs and UPI credentials are entered on
            their PCI-DSS compliant systems and never reach our servers. We
            store only a payment reference.
          </li>
          <li>
            <strong>Passwords.</strong> Checkout is guest-first — there is no
            customer account, so there is no password for us to store or leak.
          </li>
          <li>
            <strong>Session recordings.</strong> We do not record your screen,
            your mouse movements or your keystrokes.
          </li>
          <li>
            <strong>Advertising trackers.</strong> There are no third-party
            advertising or social pixels on this site.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Analytics and error monitoring">
        <p>
          We use a privacy-conscious product analytics tool to understand which
          pages are used and where checkout breaks down, and an error
          monitoring service to be told when something crashes. Both are loaded
          only after the page is usable, and neither is given your name,
          address or contact details.
        </p>
        <p>
          Error reports may include a route and an order reference so we can
          find the problem. They do not include your personal details.
        </p>
      </PolicySection>

      <PolicySection heading="Who else sees your data">
        <p>
          Only the parties who need it to complete your order, and only the
          part they need:
        </p>
        <ul>
          <li>
            <strong>Courier partners</strong> — name, address and phone number,
            so they can deliver the parcel.
          </li>
          <li>
            <strong>Razorpay</strong> — payment details you enter directly with
            them, for prepaid orders.
          </li>
          <li>
            <strong>Our email provider</strong> — your email address and order
            contents, to send your receipt and shipping updates.
          </li>
        </ul>
        <p>
          We do not sell your data, rent it, or share it for anyone else&apos;s
          marketing. We will disclose it if a court or a law lawfully requires
          us to, and not otherwise.
        </p>
      </PolicySection>

      <PolicySection heading="How long we keep it">
        <p>
          Order records are kept for eight years, because Indian tax and
          accounting rules require us to retain sales records for that period.
          Email delivery logs are kept for two years. If you ask us to erase
          your data we will remove everything not covered by that legal
          retention duty, and restrict the rest to accounting use only.
        </p>
      </PolicySection>

      <PolicySection heading="Cookies">
        <p>
          We use no advertising cookies and show no cookie banner, because we do
          not set the kind of cookies that require consent. Your cart is stored
          in your own browser&apos;s local storage rather than on our servers —
          clearing your browser data clears your cart, and we never see it
          until you place an order.
        </p>
      </PolicySection>

      <PolicySection heading="Your rights">
        <p>
          You can ask us for a copy of the data we hold about you, ask us to
          correct it, or ask us to erase it. Write from the{" "}
          <Link href="/contact">contact page</Link> using the email address on
          the order and we will respond within 30 days. We will not ask you to
          justify the request.
        </p>
      </PolicySection>

      <PolicySection heading="Security">
        <p>
          The site is served over HTTPS. Order data is stored in an access
          controlled database, queries are parameterised, and administrative
          access is restricted to named accounts with multi-factor
          authentication. No system is perfect; if we ever suffer a breach
          affecting your data we will tell you what happened and what we are
          doing about it, promptly and in plain language.
        </p>
      </PolicySection>

      <PolicySection heading="Changes and contact">
        <p>
          If this policy changes materially we will update the date at the top
          of this page and describe what changed. For any privacy question,
          write to us from the <Link href="/contact">contact page</Link>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
