import type { Metadata } from "next";
import Link from "next/link";

import { FAQ_GROUPS, FAQ_FLAT } from "@/content/faq";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { JsonLd } from "@/components/seo/JsonLd";
import { ChevronIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "FAQ — Ordering, Shipping, GI Tags & Returns",
  description:
    "Answers on guest checkout, Cash on Delivery, shipping times across India, what GI-tagged really means, spice purity, storage and our returns policy for food.",
  alternates: { canonical: "/faq" },
  openGraph: {
    url: "/faq",
    title: "Frequently Asked Questions | Ekmool",
    description:
      "Ordering, payment, shipping, product purity and returns — answered plainly.",
  },
};

export default function FaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_FLAT.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <>
      <JsonLd data={faqJsonLd} />
      <div className="mx-auto max-w-[860px] px-5 py-10 lg:py-14">
        <Breadcrumbs items={[{ href: "/faq", label: "FAQ" }]} />

        <header className="mt-10">
          <Eyebrow>Questions</Eyebrow>
          <h1 className="mt-5 font-display text-46 text-ek-green-900 lg:text-64">
            Frequently asked
          </h1>
          <p className="mt-6 max-w-[60ch] text-20 text-ek-green-700">
            If your question is not here,{" "}
            <Link href="/contact" className="link-draw">
              write to us
            </Link>{" "}
            — a person reads every message.
          </p>
        </header>

        <SoilLine align="left" className="my-12 max-w-xs" />

        {FAQ_GROUPS.map((group) => (
          <section
            key={group.heading}
            aria-labelledby={`faq-${group.heading.replace(/\W+/g, "-")}`}
            className="mt-14 first:mt-0"
          >
            <h2
              id={`faq-${group.heading.replace(/\W+/g, "-")}`}
              className="font-display text-26 text-ek-green-900"
            >
              {group.heading}
            </h2>
            <ul className="mt-6 border-t border-ek-green-200">
              {group.items.map((item) => (
                <li
                  key={item.question}
                  className="border-b border-ek-green-200"
                >
                  <details className="group">
                    <summary className="flex cursor-pointer items-start justify-between gap-6 py-5 font-display text-20 text-ek-green-900 marker:content-none [&::-webkit-details-marker]:hidden">
                      {item.question}
                      <ChevronIcon className="mt-1 size-5 shrink-0 text-ek-green-700 transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <p className="max-w-[68ch] pb-6 text-17 text-ek-green-700">
                      {item.answer}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
