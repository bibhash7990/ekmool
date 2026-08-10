/**
 * The three static catalogue documents.
 *
 *   GET /catalog/v1.json           the catalogue
 *   GET /catalog/reviews-v1.json   published reviews
 *   GET /catalog/content-v1.json   editorial and legal copy
 *
 * Files, not endpoints. Each is prerendered once, served from static
 * output, and purged only by the tag its underlying reader already carries
 * — `products`, `reviews`, `site-content` respectively. They are browsing
 * surfaces in the sense of docs/ARCHITECTURE.md's rendering table: row one,
 * static, does not touch MySQL at request time. `scripts/chaos.mjs` stops
 * the database under live traffic and asserts browsing keeps serving 200s,
 * and a phone must inherit that property rather than consume it.
 *
 * WHY THREE DOCUMENTS AND NOT ONE
 *
 * docs/ARCHITECTURE.md: "Two tags exist and they are separate on purpose.
 * Moderating a review must not send every product page back to the database
 * for catalogue data that has not changed." A combined document would undo
 * that for every phone at once — one moderated review would invalidate the
 * catalogue for the whole install base. Three documents, three tags, fetched
 * independently.
 *
 * WHY `Product` IS IMPORTED RATHER THAN RE-DECLARED
 *
 * responses.ts re-declares `OrderStatus` and `ServiceabilityCode` instead of
 * importing them from @ekmool/core, and explains why: six strings whose
 * unions are structurally identical, so assignment across the boundary
 * fails typecheck the moment they drift, and the wire vocabulary does not
 * become a downstream of the arithmetic. Neither half of that reasoning
 * survives contact with `Product`. It is twelve fields and two nested
 * arrays; a structural copy would be a copy that drifts in silence, because
 * nothing ever assigns one to the other — the document is built from
 * `getCatalog()` and consumed by a client that has never seen the original.
 * `@ekmool/core` is a declared dependency of this package for exactly this.
 */

import type { Product } from "@ekmool/core/catalog";

/**
 * Every document carries `version` and `generatedAt`.
 *
 * `version` is the document format, not the app and not the catalogue. It
 * changes only when a field is removed or its meaning changes, which is
 * also when the path changes — `v2.json` beside `v1.json`, both served,
 * until the old clients are gone. Adding a field does not move it.
 *
 * `generatedAt` is ISO-8601 UTC and exists so a support conversation can
 * establish how stale a phone's copy is. Note that it is deliberately
 * **excluded from the ETag**, so two responses can carry the same validator
 * and different stamps; a client must not treat it as a change detector.
 * See apps/web/src/lib/catalog-document.ts for the full account.
 */
export interface CatalogDocument {
  version: 1;
  generatedAt: string;
  /**
   * Every active product, in the catalogue's own sort order.
   *
   * Exactly what `getCatalog()` returns and **nothing derived**. No
   * "bestseller", no "popular", no rating folded in from the reviews
   * document — rule 5. Prices are integer paise (`pricePaise`, `mrpPaise`)
   * and are never converted to rupees on this path — rule 4.
   *
   * `variants[].stockQty` is up to an hour stale, because the document is
   * regenerated on the ISR window. The web accepts the same trade
   * (docs/PERFORMANCE.md), where correctness lives in the atomic decrement
   * at checkout rather than in the display. A client may show "3 left" only
   * when the number is literally 3, and must not phrase it as though the
   * figure were live.
   */
  products: Product[];
}

/**
 * One published review, carrying only what the product page already shows a
 * logged-out visitor.
 *
 * There is no customer email and no order id here, and that is checked
 * rather than assumed: in apps/web/src/db/queries/reviews.ts, `Review` has
 * neither, and `PendingReview` — which extends it with `customerEmail` and
 * `orderId` — is built only by `listReviewsForModeration` for /admin.
 * `getProductReviews`, the reader behind this document, returns `Review`.
 */
export interface PublicReview {
  id: number;
  /** A derived byline: "Bibhash S.". Never the name on the parcel. */
  displayName: string;
  /** 1–5, as submitted. */
  rating: number;
  title: string;
  body: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** The reviews for one product, and their average. */
export interface ProductReviewsEntry {
  /**
   * **Null**, not zero, when nothing has been published — rule 5. A product
   * nobody has reviewed shows no rating at all. A client that renders
   * `rating.average` without the null check will crash, which is the right
   * direction to fail: printing "0.0 out of 5" for an unreviewed product is
   * an invented rating, and it is the kind that reads as real.
   */
  rating: { count: number; average: number } | null;
  /** Most recent first. Capped by the reader, currently at 20 per product. */
  reviews: PublicReview[];
}

/**
 * Published reviews for every product in the catalogue, keyed by slug.
 *
 * Every catalogue slug is present, including the ones with nothing
 * published — those carry `rating: null` and an empty array. An absent key
 * and an empty entry would otherwise mean the same thing by convention
 * only, and a client would eventually get the convention wrong.
 */
export interface ReviewsDocument {
  version: 1;
  generatedAt: string;
  products: Record<string, ProductReviewsEntry>;
}

/**
 * Editorial copy and the admin-editable legal pages.
 *
 * The app must render the same privacy policy as the site. If it shipped
 * its own copy the two would diverge the first time the owner edited one,
 * and a privacy policy that differs by device is a compliance problem
 * before it is a content problem.
 *
 * `values` is keyed by the dotted content keys in
 * apps/web/src/content/defaults.ts, and typed `Record<string, string>`
 * rather than by that union on purpose: the key set is the application's,
 * it grows every time someone makes a string editable, and a client built
 * against last quarter's union would fail to compile against a document
 * that merely gained a key. A client looks up what it needs and falls back
 * to its own bundled string when a key is missing.
 */
export interface ContentDocument {
  version: 1;
  generatedAt: string;
  values: Record<string, string>;
}
