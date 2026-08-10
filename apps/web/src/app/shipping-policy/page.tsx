import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { getContent, t } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { DELIVERY_ZONES, DISPATCH_DAYS } from "@ekmool/core/serviceability";

export const metadata: Metadata = {
  title: "Shipping Policy — Delivery Times & Charges",
  description:
    "Ekmool shipping policy: dispatch within one working day, free delivery above ₹499, flat ₹49 below, timelines by region, tracking and undelivered parcels.",
  alternates: { canonical: "/shipping-policy" },
};

/**
 * The plain sections, in order. "times" is not here because it wraps the
 * delivery-zone table and is rendered separately below.
 */
const BEFORE_TIMES = ["where", "charges"] as const;
const AFTER_TIMES = [
  "tracking",
  "packaging",
  "failed",
  "damage",
  "questions",
] as const;

export default async function ShippingPolicy() {
  const content = await getContent();

  return (
    <PolicyPage
      href="/shipping-policy"
      label="Shipping Policy"
      title="Shipping Policy"
      standfirst={t(content, "policy.shipping.standfirst")}
      updated={t(content, "policy.shipping.updated")}
    >
      {BEFORE_TIMES.map((section) => (
        <PolicySection
          key={section}
          heading={t(content, `policy.shipping.${section}.heading`)}
        >
          {renderMarkdown(t(content, `policy.shipping.${section}.body`))}
        </PolicySection>
      ))}

      <PolicySection heading={t(content, "policy.shipping.times.heading")}>
        {renderMarkdown(t(content, "policy.shipping.times.before"))}

        {/*
          NOT editable, deliberately, and the one section split into a
          before and an after so it can stay that way.

          The zones render from @ekmool/core/serviceability, which is the same
          table the PIN code checker on a product page reads. A policy and
          a widget quoting different numbers is how a shop ends up with a
          promise it did not know it had made — so this cannot be a
          content key, no matter how convenient that would be.
        */}
        <ul>
          {Object.values(DELIVERY_ZONES).map((zone) => (
            <li key={zone.id}>
              {zone.label} — {zone.minDays} to {zone.maxDays} working days
            </li>
          ))}
        </ul>
        <p>
          The PIN code checker on any product page adds the {DISPATCH_DAYS}{" "}
          working day for packing and gives you the total, so the figure it
          shows is from the moment you order rather than from dispatch.
        </p>

        {renderMarkdown(t(content, "policy.shipping.times.after"))}
      </PolicySection>

      {AFTER_TIMES.map((section) => (
        <PolicySection
          key={section}
          heading={t(content, `policy.shipping.${section}.heading`)}
        >
          {renderMarkdown(t(content, `policy.shipping.${section}.body`))}
        </PolicySection>
      ))}
    </PolicyPage>
  );
}
