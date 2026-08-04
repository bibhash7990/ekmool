import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/legal/PolicyPage";

export const metadata: Metadata = {
  title: "Terms of Service — Orders, Pricing & Liability",
  description:
    "The terms you agree to when ordering from Ekmool: how an order is formed, pricing and stock accuracy, product descriptions, liability limits and governing law.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PolicyPage
      href="/terms"
      label="Terms of Service"
      title="Terms of Service"
      standfirst="The agreement between you and Ekmool when you place an order. Short, and written in the same voice as everything else on this site."
      updated="4 August 2026"
    >
      <PolicySection heading="Who these terms are between">
        <p>
          These terms apply between you and Ekmool, a direct-to-consumer food
          business operating in India, whenever you use this website or place
          an order through it. By placing an order you accept them.
        </p>
        <p>
          You must be at least 18 years old, or have the consent of a parent or
          guardian, to place an order.
        </p>
      </PolicySection>

      <PolicySection heading="How an order is formed">
        <p>
          Adding items to your cart or reaching the checkout page does not
          create a contract. A contract is formed when we confirm your order —
          for Cash on Delivery, at the moment you place it; for prepaid orders,
          when payment is confirmed.
        </p>
        <p>
          We may decline or cancel an order before dispatch if an item is out of
          stock, if a price was listed in error, if the delivery address is not
          serviceable, or if we reasonably suspect fraud. If we cancel a
          prepaid order we refund it in full.
        </p>
      </PolicySection>

      <PolicySection heading="Pricing and stock">
        <p>
          All prices are in Indian Rupees and include GST. Shipping is shown
          separately at checkout and is free above ₹499.
        </p>
        <p>
          Product pages are served from a cache that refreshes hourly, so a
          price or stock figure can briefly be out of date. The authoritative
          check happens when you place the order: if an item has sold out in
          the meantime the order is rejected with a clear message rather than
          part-fulfilled, and nothing is charged. If a price shown was
          materially wrong we will contact you before dispatch and give you the
          choice to confirm at the correct price or cancel.
        </p>
      </PolicySection>

      <PolicySection heading="Product descriptions">
        <p>
          We describe origin, processing and composition as accurately as we
          can, and publish figures such as curcumin content as ranges because
          agricultural products vary between harvests. Colour, aroma and
          intensity will vary a little between lots because we do not
          colour-correct or standardise our spices.
        </p>
        <p>
          Nothing on this site is medical advice, and we make no claim that any
          product diagnoses, treats, cures or prevents any condition. If you
          have a food allergy, are pregnant, or take medication, consult a
          qualified professional before making significant changes to your
          diet.
        </p>
        <p>
          Photographs are illustrative. The pack you receive may differ
          slightly in appearance from the images shown.
        </p>
      </PolicySection>

      <PolicySection heading="Delivery, returns and refunds">
        <p>
          Delivery timelines and charges are set out in our{" "}
          <Link href="/shipping-policy">shipping policy</Link>. Returns,
          replacements and refunds — including the food-safety limits on
          returning opened packs — are set out in our{" "}
          <Link href="/refund-policy">refund policy</Link>. Both form part of
          these terms.
        </p>
      </PolicySection>

      <PolicySection heading="Your responsibilities">
        <ul>
          <li>
            Give us a delivery address and phone number that are accurate and
            reachable. Most failed deliveries in India are unanswered phone
            calls.
          </li>
          <li>
            Store food products as described on the pack once they reach you.
          </li>
          <li>
            Do not resell our products commercially without a written wholesale
            agreement.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Intellectual property">
        <p>
          The Ekmool name, mark, packaging design, photography and written
          content on this site belong to us. You may not reproduce them
          commercially without permission. The Geographical Indications we
          reference belong to their registered producer collectives, not to us —
          we are a buyer operating inside those boundaries, not a rights
          holder.
        </p>
      </PolicySection>

      <PolicySection heading="Liability">
        <p>
          Our liability for any order is limited to the amount you paid for it,
          together with any refund or replacement due under our refund policy.
          We are not liable for indirect or consequential loss.
        </p>
        <p>
          Nothing here excludes liability that cannot lawfully be excluded,
          including liability for death or personal injury caused by
          negligence, for fraud, or under the Consumer Protection Act, 2019.
        </p>
      </PolicySection>

      <PolicySection heading="Availability">
        <p>
          We aim to keep the site available continuously but do not guarantee
          it. Maintenance, third-party outages and genuine emergencies happen.
          If checkout is unavailable when you try, your cart is stored in your
          own browser and will still be there when the site returns.
        </p>
      </PolicySection>

      <PolicySection heading="Governing law">
        <p>
          These terms are governed by the laws of India, and the courts of
          India have exclusive jurisdiction over any dispute arising from them.
          Before any of that, please just write to us from the{" "}
          <Link href="/contact">contact page</Link> — we would far rather fix
          the problem.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
