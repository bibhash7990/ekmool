import { listReviewsForModeration } from "@/db/queries/reviews";
import { ReviewModerator } from "@/components/admin/ReviewModerator";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const [pending, published, rejected] = await Promise.all([
    listReviewsForModeration("pending"),
    listReviewsForModeration("published"),
    listReviewsForModeration("rejected"),
  ]);

  return (
    <div className="mt-8">
      <Eyebrow>Moderation</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">Reviews</h1>

      <p className="mt-5 max-w-[70ch] text-15 text-ek-green-700">
        Every review here came from a delivered order containing that product
        — the database will not accept one that did not. Nothing appears on a
        product page until you publish it, and rejecting keeps the row rather
        than deleting it, so a customer asking why theirs never went up can be
        answered.
      </p>

      <section className="mt-10">
        <h2 className="eyebrow text-ek-green-700">
          Waiting for you · {pending.length}
        </h2>
        {pending.length === 0 ? (
          <p className="mt-4 text-17 text-ek-green-700">
            Nothing waiting.
          </p>
        ) : (
          <ul className="mt-2 border-t border-ek-green-200">
            {pending.map((review) => (
              <ReviewModerator key={review.id} review={review} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14">
        <h2 className="eyebrow text-ek-green-700">
          Published · {published.length}
        </h2>
        {published.length === 0 ? (
          <p className="mt-4 text-17 text-ek-green-700">
            None yet. Product pages show no rating at all until there is one —
            not a zero, and no invented star average.
          </p>
        ) : (
          <ul className="mt-4 space-y-2 text-15 text-ek-green-700">
            {published.map((review) => (
              <li key={review.id}>
                <span className="tabular-nums">{review.rating}/5</span> ·{" "}
                {review.productSlug} · {review.title}{" "}
                <span className="text-ek-green-900">— {review.displayName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rejected.length > 0 && (
        <section className="mt-14">
          <h2 className="eyebrow text-ek-green-700">
            Rejected · {rejected.length}
          </h2>
          <ul className="mt-4 space-y-2 text-15 text-ek-green-700">
            {rejected.map((review) => (
              <li key={review.id}>
                {review.productSlug} · {review.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
