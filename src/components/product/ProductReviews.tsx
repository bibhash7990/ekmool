import Link from "next/link";
import type { ProductReviews as ProductReviewsData } from "@/db/queries/reviews";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { ReviewForm } from "./ReviewForm";

/**
 * Reviews on a product page — server-rendered, so they cost no client
 * JavaScript and are in the HTML a crawler reads.
 *
 * The empty state is the interesting one. With nothing published we show
 * no rating, no star row and no count: not "0.0", not "No ratings yet
 * (0)". A zero next to five stars reads as a bad score, and a shop with a
 * new product has not earned a bad score. It has earned silence.
 */

function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span
      className="inline-flex gap-0.5 align-middle"
      role="img"
      aria-label={`${rating} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((position) => (
        <svg
          key={position}
          viewBox="0 0 20 20"
          className={`size-4 ${position <= filled ? "text-ek-gold-600" : "text-ek-green-200"}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 1.6l2.5 5.3 5.7.8-4.1 4 1 5.7L10 14.7 4.9 17.4l1-5.7-4.1-4 5.7-.8z" />
        </svg>
      ))}
    </span>
  );
}

export function ProductReviews({
  productSlug,
  productName,
  data,
}: {
  productSlug: string;
  productName: string;
  data: ProductReviewsData;
}) {
  const { reviews, rating } = data;

  return (
    <section aria-labelledby="reviews-heading">
      <Eyebrow as="h2">
        <span id="reviews-heading">What buyers said</span>
      </Eyebrow>

      {rating ? (
        <p className="mt-5 flex flex-wrap items-center gap-3 text-20 text-ek-green-900">
          <Stars rating={rating.average} />
          <span className="tabular-nums">{rating.average.toFixed(1)}</span>
          <span className="text-17 text-ek-green-700">
            from {rating.count} verified {rating.count === 1 ? "buyer" : "buyers"}
          </span>
        </p>
      ) : (
        <p className="mt-5 max-w-[56ch] text-17 text-ek-green-700">
          Nobody has reviewed this yet. We do not write our own, and we do not
          buy them in — so this stays empty until someone who received a parcel
          has something to say.
        </p>
      )}

      {reviews.length > 0 && (
        <ul className="mt-8 space-y-8">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="border-t border-ek-green-200 pt-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Stars rating={review.rating} />
                <p className="text-17 text-ek-green-900">{review.title}</p>
              </div>
              <p className="mt-3 max-w-[68ch] text-17 text-ek-green-700">
                {review.body}
              </p>
              <p className="mt-3 text-15 text-ek-green-700">
                {review.displayName} ·{" "}
                <span className="text-ek-green-900">Verified buyer</span> ·{" "}
                {review.createdAt.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 border-t border-ek-green-200 pt-8">
        <ReviewForm productSlug={productSlug} productName={productName} />
        <p className="mt-4 max-w-[60ch] text-15 text-ek-green-700">
          Only people with a delivered order containing this product can
          review it, and every review is read before it goes up.{" "}
          <Link href="/track" className="link-draw">
            Find your order
          </Link>{" "}
          to write one.
        </p>
      </div>
    </section>
  );
}
