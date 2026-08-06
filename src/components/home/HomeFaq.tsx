import Link from "next/link";

import { FAQ_FLAT } from "@/content/faq";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ChevronIcon } from "@/components/icons";

/**
 * Six questions, taken from the site FAQ rather than rewritten.
 *
 * Selected by question text against src/content/faq.ts, which stays the
 * single source: an answer edited there changes here too, and the home
 * page can never quietly hold last quarter's shipping rate.
 *
 * **No FAQPage structured data on this page.** /faq already emits it for
 * the full set, and Google treats duplicate FAQPage markup across two URLs
 * as the same content twice — the usual outcome is neither URL getting the
 * rich result. Home gets the visible Q&A, which is the part that helps a
 * reader, and a link to the page that owns the markup.
 */
const HOME_QUESTIONS = [
  "Do I need an account to order?",
  "Is Cash on Delivery available?",
  "How much does shipping cost?",
  "How long will my order take to arrive?",
  "Are your spices pure, or blended with anything?",
  "What if my order arrives damaged or wrong?",
] as const;

const ITEMS = HOME_QUESTIONS.map((question) => {
  const item = FAQ_FLAT.find((entry) => entry.question === question);
  if (!item) {
    // Loud at build time, because the alternative is a home page that
    // silently renders five questions instead of six the day someone
    // rewords one in faq.ts.
    throw new Error(
      `HomeFaq: no FAQ entry matches "${question}" — it was renamed or removed in src/content/faq.ts`,
    );
  }
  return item;
});

export function HomeFaq() {
  return (
    <section aria-labelledby="faq-heading">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-8 lg:py-24">
        <div>
          <Eyebrow as="h2">Questions</Eyebrow>
          <p
            id="faq-heading"
            className="mt-5 font-display text-34 text-ek-green-900 lg:text-46"
          >
            The six people ask most.
          </p>
          <p className="mt-6 max-w-[40ch] text-17 text-ek-green-700">
            There are more — on storage, on why the colour shifts between
            harvests, on why we will not make a health claim.
          </p>
          <Link
            href="/faq"
            className="link-draw mt-6 inline-block text-17 text-ek-green-900"
          >
            Read all of them
          </Link>
        </div>

        <ul className="border-t border-ek-green-200">
          {ITEMS.map((item) => (
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
      </div>
    </section>
  );
}
