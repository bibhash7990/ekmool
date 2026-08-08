import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { getContent, t } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "Refund & Returns Policy — Food Safety Rules",
  description:
    "When Ekmool refunds or replaces an order, why opened food packs cannot be returned, how to report damage within 48 hours, how long refunds take to reach you.",
  alternates: { canonical: "/refund-policy" },
};

/**
 * The section order, in one place.
 *
 * A list rather than eight repeated <PolicySection> blocks: the page is
 * now a rendering of the content map, and the order of that map is the
 * only thing this file still decides. Adding a section is a key in
 * defaults.ts and an entry here — the markup below does not change.
 */
const SECTIONS = [
  "short",
  "damaged",
  "sealed",
  "opened",
  "cancellations",
  "how",
  "excluded",
  "rights",
] as const;

export default async function RefundPolicy() {
  const content = await getContent();

  return (
    <PolicyPage
      href="/refund-policy"
      label="Refund Policy"
      // Not editable: it is the <h1>, the breadcrumb and the metadata
      // title, and those three must agree. A page whose heading and
      // browser tab disagree reads as the wrong page.
      title="Refund & Returns Policy"
      standfirst={t(content, "policy.refund.standfirst")}
      updated={t(content, "policy.refund.updated")}
    >
      {SECTIONS.map((section) => (
        <PolicySection
          key={section}
          heading={t(content, `policy.refund.${section}.heading`)}
        >
          {renderMarkdown(t(content, `policy.refund.${section}.body`))}
        </PolicySection>
      ))}
    </PolicyPage>
  );
}
