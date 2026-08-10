import { getCatalog } from "@/db/queries/products";
import { getProductReviews } from "@/db/queries/reviews";
import { documentResponse, toReviewsDocument } from "@/lib/catalog-document";

/**
 * GET /catalog/reviews-v1.json — published reviews, per product.
 *
 * WHY THIS IS NOT PART OF /catalog/v1.json
 *
 * docs/ARCHITECTURE.md: "Two tags exist and they are separate on purpose.
 * Moderating a review must not send every product page back to the database
 * for catalogue data that has not changed." A combined document would undo
 * that at the scale of the whole install base — every moderated review would
 * invalidate the catalogue for every phone, and every phone would re-download
 * five products' worth of descriptions and image lists to learn that somebody
 * liked the turmeric.
 *
 * So: this document is tagged `reviews`, v1.json is tagged `products`, and
 * the app fetches them independently. `revalidateReviews()` purges this one
 * and leaves the catalogue alone, which is the assertion in the phase plan
 * worth writing — it is the one that fails against a combined document.
 *
 * The coupling runs one way only, and only for the slug list: this route
 * calls `getCatalog()` to learn which products exist, so its cache entry
 * carries `products` as well as `reviews` and an admin stock edit does
 * regenerate it. That costs nothing on the wire, because the ETag is a hash
 * of the document with `generatedAt` excluded — a regeneration that changed
 * no review produces the same validator and every phone still gets a 304.
 * See `documentResponse` in src/lib/catalog-document.ts.
 *
 * WHY getProductReviews AND NOT A NEW QUERY
 *
 * Same reason as v1.json: `getProductReviews` wraps
 * `unstable_cache(loadProductReviews, ["product-reviews"], { tags:
 * [REVIEWS_TAG], revalidate: 3600 })`, so `revalidateReviews()` — which the
 * admin's moderation action already calls — purges this document with no new
 * invalidation story and no new SQL. It is called once per catalogue product,
 * five times today. Those are not five extra reads: an unstable_cache key is
 * the wrapped function plus its key parts plus its arguments, so each call
 * lands on the entry `/products/[slug]` already built for the same slug.
 *
 * `getRecentReviews` is the tempting single call and the wrong one: it caps
 * at twelve rows across the *whole* catalogue, where the product page shows
 * up to twenty per product. An app built on it would show fewer reviews than
 * the website does for the same product, and show them silently — nothing in
 * the response says rows were dropped.
 */

export const dynamic = "force-static";
export const revalidate = 3600;

/** No `request` parameter — see the note in ../v1.json/route.ts. */
export async function GET(): Promise<Response> {
  const products = await getCatalog();

  // Promise.all rather than a sequential loop: one independent cached read
  // per product, and Promise.all resolves in input order, so the document's
  // key order stays the catalogue's own (sort_order, id). That determinism
  // is load-bearing — the ETag is a hash of the serialised object, and a key
  // order that moved between regenerations would change it for nothing.
  const perProduct = await Promise.all(
    products.map(async (product) => ({
      slug: product.slug,
      published: await getProductReviews(product.slug),
    })),
  );

  return documentResponse(toReviewsDocument(perProduct));
}
