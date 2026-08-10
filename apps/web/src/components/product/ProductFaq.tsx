import type { ProductFaq as Faq } from "@/content/products";
import { ChevronIcon } from "@/components/icons";

/**
 * Visible Q&A, rendered with native <details> — no JS, keyboard-operable,
 * and crawlable. This markup is the ONLY source for FAQPage structured
 * data, so the two can never disagree.
 */
export function ProductFaqList({
  faq,
  headingId,
}: {
  faq: Faq[];
  headingId: string;
}) {
  return (
    <ul aria-labelledby={headingId} className="border-t border-ek-green-200">
      {faq.map((item) => (
        <li key={item.question} className="border-b border-ek-green-200">
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
  );
}
