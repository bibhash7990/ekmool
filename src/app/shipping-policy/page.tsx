import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/legal/PolicyPage";

export const metadata: Metadata = {
  title: "Shipping Policy — Delivery Times & Charges",
  description:
    "Ekmool shipping policy: dispatch within one working day, free delivery above ₹499, flat ₹49 below, timelines by region, tracking and undelivered parcels.",
  alternates: { canonical: "/shipping-policy" },
};

export default function ShippingPolicy() {
  return (
    <PolicyPage
      href="/shipping-policy"
      label="Shipping Policy"
      title="Shipping Policy"
      standfirst="Where we ship, what it costs, how long it takes, and what happens when something goes wrong in transit."
      updated="4 August 2026"
    >
      <PolicySection heading="Where we ship">
        <p>
          We ship to all serviceable PIN codes across India. We do not
          currently ship internationally. If our courier partners cannot reach
          your PIN code we will contact you and refund the order in full rather
          than leave it pending.
        </p>
      </PolicySection>

      <PolicySection heading="Charges">
        <ul>
          <li>Orders of ₹499 and above — free shipping.</li>
          <li>
            Orders below ₹499 — flat ₹49, anywhere in India, regardless of
            distance.
          </li>
          <li>
            Cash on Delivery carries no extra fee. All prices shown on the site
            already include GST.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="Dispatch and delivery times">
        <p>
          Orders are packed and handed to the courier within one working day of
          confirmation. Orders placed on Sunday or a public holiday are packed
          the next working day.
        </p>
        <p>Typical transit time after dispatch:</p>
        <ul>
          <li>Metro cities — 2 to 4 working days</li>
          <li>Other cities and towns — 4 to 7 working days</li>
          <li>
            Remote PIN codes, hill districts and the North East — 6 to 10
            working days
          </li>
        </ul>
        <p>
          These are courier estimates, not guarantees. Weather, festival
          season, strikes and regional restrictions can extend them, and we
          will tell you if we know a delay is coming.
        </p>
      </PolicySection>

      <PolicySection heading="Tracking">
        <p>
          You receive a tracking link by email the moment your parcel is handed
          over. That link is more current than we are, because it reads the
          courier&apos;s own system directly. If tracking has not moved for more
          than three working days, write to us and we will open a query with
          the courier.
        </p>
      </PolicySection>

      <PolicySection heading="Packaging">
        <p>
          Spices are packed in sealed, food-grade pouches inside a rigid outer
          carton, with the batch and packing date printed on the pouch. We use
          paper tape and paper-based void fill rather than plastic wherever the
          parcel weight allows it.
        </p>
      </PolicySection>

      <PolicySection heading="Failed and undelivered parcels">
        <p>
          Couriers usually attempt delivery up to three times. Please make sure
          the phone number on your order is one you will answer, as most failed
          deliveries in India are failed phone calls rather than failed
          addresses.
        </p>
        <p>
          If a parcel returns to us undelivered we will contact you to arrange
          a re-dispatch. For prepaid orders you may instead request a refund of
          the order value; the original shipping charge is not refunded on a
          second attempt caused by an incorrect address or an unreachable
          number.
        </p>
      </PolicySection>

      <PolicySection heading="Damage in transit">
        <p>
          If your parcel arrives damaged, or a pouch has burst, tell us within
          48 hours of delivery with a photograph and we will replace or refund
          it in full. You will not be asked to ship it back. See the{" "}
          <Link href="/refund-policy">refund policy</Link> for how and when the
          money reaches you.
        </p>
      </PolicySection>

      <PolicySection heading="Questions">
        <p>
          Anything not covered here — write to us from the{" "}
          <Link href="/contact">contact page</Link> with your order reference.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
