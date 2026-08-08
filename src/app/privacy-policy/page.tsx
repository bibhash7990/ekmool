import type { Metadata } from "next";
import { PolicyPage, PolicySection } from "@/components/legal/PolicyPage";
import { getContent, t } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "Privacy Policy — What Data Ekmool Collects & Why",
  description:
    "What personal data Ekmool collects when you order, who processes it, how long we keep it, what we deliberately do not collect, and how to have your data erased.",
  alternates: { canonical: "/privacy-policy" },
};

const SECTIONS = [
  "collect",
  "notcollect",
  "analytics",
  "sharing",
  "retention",
  "cookies",
  "rights",
  "security",
  "changes",
] as const;

export default async function PrivacyPolicy() {
  const content = await getContent();

  return (
    <PolicyPage
      href="/privacy-policy"
      label="Privacy Policy"
      title="Privacy Policy"
      standfirst={t(content, "policy.privacy.standfirst")}
      updated={t(content, "policy.privacy.updated")}
    >
      {SECTIONS.map((section) => (
        <PolicySection
          key={section}
          heading={t(content, `policy.privacy.${section}.heading`)}
        >
          {renderMarkdown(t(content, `policy.privacy.${section}.body`))}
        </PolicySection>
      ))}
    </PolicyPage>
  );
}
