import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { getContent, t } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "Terms of Service — Orders, Pricing & Liability",
  description:
    "The terms you agree to when ordering from Ekmool: how an order is formed, pricing and stock accuracy, product descriptions, liability limits and governing law.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  "parties",
  "formation",
  "pricing",
  "descriptions",
  "delivery",
  "responsibilities",
  "ip",
  "liability",
  "availability",
  "law",
] as const;

export default async function TermsPage() {
  const content = await getContent();

  return (
    <PolicyPage
      href="/terms"
      label="Terms of Service"
      title="Terms of Service"
      standfirst={t(content, "policy.terms.standfirst")}
      updated={t(content, "policy.terms.updated")}
    >
      {SECTIONS.map((section) => (
        <PolicySection
          key={section}
          heading={t(content, `policy.terms.${section}.heading`)}
        >
          {renderMarkdown(t(content, `policy.terms.${section}.body`))}
        </PolicySection>
      ))}
    </PolicyPage>
  );
}
