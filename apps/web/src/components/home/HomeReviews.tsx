import Link from "next/link";

import type { RecentReview } from "@/db/queries/reviews";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Stars } from "@/components/product/Stars";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * The most recent verified-buyer reviews, or nothing at all.
 *
 * `null` when the list is empty is the whole design of this component. A
 * home page that says "reviews coming soon" under a row of grey stars has
 * decided that the *shape* of social proof is worth showing before the
 * substance exists, and every visitor who has seen a seeded testimonial
 * knows what that shape is worth. An absent section asks nothing of the
 * reader and claims nothing.
 *
 * There is no AggregateRating markup here either. The average that means
 * something is per product, and it lives on the product page next to the
 * reviews it averages — a site-wide star score assembled on the home page
 * would be a number no page can be checked against.
 *
 * Every review shown reached this table through findReviewableOrder: a
 * delivered order, in the reader's own name, containing that product. See
 * src/db/queries/reviews.ts.
 */
export function HomeReviews({ reviews }: { reviews: RecentReview[] }) {
  if (reviews.length === 0) return null;

  return (
    <section aria-labelledby="voices-heading">
      <div className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <Eyebrow as="h2">In their kitchens</Eyebrow>
          <p
            id="voices-heading"
            className="mt-5 font-display text-34 text-ek-green-900 lg:text-46"
          >
            From people who cooked with it.
          </p>
          <p className="mt-5 max-w-[54ch] text-17 text-ek-green-700">
            Only a delivered order can leave one, and we have never written
            or bought a single review on this site.
          </p>
        </div>

        <ul className="mt-12 grid gap-x-10 gap-y-10 lg:grid-cols-3">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="border-t-2 border-ek-gold-500 pt-6"
            >
              <Stars rating={review.rating} />
              <h3 className="mt-4 font-display text-20 text-ek-green-900">
                {review.title}
              </h3>
              <p className="mt-3 text-17 text-ek-green-700">{review.body}</p>
              <p className="mt-5 text-15 text-ek-green-700">
                {review.displayName} ·{" "}
                <span className="text-ek-green-900">Verified buyer</span> ·{" "}
                <time dateTime={review.createdAt.toISOString()}>
                  {DATE_FORMAT.format(review.createdAt)}
                </time>
              </p>
              <Link
                href={`/products/${review.productSlug}`}
                className="link-draw mt-2 inline-block text-15 text-ek-gold-800"
              >
                {review.productName}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
