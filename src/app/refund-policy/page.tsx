import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/legal/PolicyPage";

export const metadata: Metadata = {
  title: "Refund & Returns Policy — Food Safety Rules",
  description:
    "When Ekmool refunds or replaces an order, why opened food packs cannot be returned, how to report damage within 48 hours, how long refunds take to reach you.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicy() {
  return (
    <PolicyPage
      href="/refund-policy"
      label="Refund Policy"
      title="Refund & Returns Policy"
      standfirst="We sell food, which limits what we can take back. Here is exactly where the line sits and what we do on either side of it."
      updated="4 August 2026"
    >
      <PolicySection heading="The short version">
        <ul>
          <li>
            Damaged, wrong or missing items — full replacement or refund, no
            return shipping, no argument. Tell us within 48 hours.
          </li>
          <li>
            Sealed, unopened packs — returnable within 7 days of delivery.
          </li>
          <li>
            Opened food packs — cannot be returned, because food-safety rules
            prevent us reselling them.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Damaged, wrong or missing items">
        <p>
          Write to us within 48 hours of delivery with your order reference and
          a photograph of the parcel and its contents. We will send a
          replacement or refund the full amount, including any shipping you
          paid, and you will not be asked to ship anything back.
        </p>
        <p>
          This is the one situation where we do not want a debate. If a parcel
          arrived in a state you would not have accepted in a shop, that is our
          problem to fix.
        </p>
      </PolicySection>

      <PolicySection heading="Sealed, unopened packs">
        <p>
          If you have changed your mind and the pouch is still sealed, you may
          return it within 7 days of delivery. The pack must be unopened, with
          its seal and labels intact, and in a condition that lets us confirm
          it was never in use.
        </p>
        <p>
          Return shipping for change-of-mind returns is at your cost, and the
          original shipping charge is not refunded. Once we receive and inspect
          the pack we refund the product value.
        </p>
      </PolicySection>

      <PolicySection heading="Opened packs — why we cannot accept them">
        <p>
          Once a food pouch is opened we cannot verify how it was stored, and
          under Indian food-safety rules we cannot resell it. Accepting opened
          returns would mean either destroying the stock at your expense or
          reselling food we cannot vouch for. Neither is acceptable, so we do
          not accept opened returns for change of mind.
        </p>
        <p>
          That said: if something tasted wrong to you — musty, flat, unlike the
          description — write to us anyway. That is a sourcing signal we want
          to hear about, and we will usually make it right even though the
          policy does not require us to.
        </p>
      </PolicySection>

      <PolicySection heading="Cancellations">
        <p>
          You can cancel any order that has not yet shipped, for a full refund.
          Write to us from the <Link href="/contact">contact page</Link> with
          your order reference as soon as you can — we pack within one working
          day, so the window is short.
        </p>
        <p>
          Once a parcel has been handed to the courier we cannot recall it, but
          you may refuse delivery. For a Cash on Delivery order that costs you
          nothing. For a prepaid order we refund the product value once the
          parcel returns to us.
        </p>
      </PolicySection>

      <PolicySection heading="How refunds are paid">
        <ul>
          <li>
            Prepaid orders — refunded to the original payment method through
            Razorpay. Banks typically credit this within 5 to 7 working days of
            us initiating it.
          </li>
          <li>
            Cash on Delivery orders — refunded by bank transfer or UPI to an
            account you nominate, usually within 3 to 5 working days of us
            receiving the details.
          </li>
        </ul>
        <p>
          We initiate every approved refund within 2 working days. The time
          after that is your bank&apos;s, not ours, and we will share the
          reference number so you can chase it if needed.
        </p>
      </PolicySection>

      <PolicySection heading="What is not covered">
        <ul>
          <li>
            Natural variation in colour, aroma or intensity between harvest
            lots. We do not colour-correct or standardise our spices, so some
            variation across a season is expected and described on each product
            page.
          </li>
          <li>
            Products damaged after delivery by storage in heat, damp or direct
            sunlight.
          </li>
          <li>
            Claims made more than 7 days after delivery, except where the
            product was defective on arrival and reported within 48 hours.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Consumer rights">
        <p>
          Nothing in this policy limits your rights under the Consumer
          Protection Act, 2019 or the Consumer Protection (E-Commerce) Rules,
          2020. If you believe we have handled something unfairly, say so
          directly — we would rather resolve it with you than have you escalate
          it.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
