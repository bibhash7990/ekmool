import { createHash } from "node:crypto";

import type { Product } from "@ekmool/core/catalog";
import type {
  CatalogDocument,
  ContentDocument,
  ProductReviewsEntry,
  PublicReview,
  ReviewsDocument,
} from "@ekmool/contracts/documents";
import type { ProductReviews, Review } from "@/db/queries/reviews";

/**
 * Building and serving the three static catalogue documents.
 *
 * No `import "server-only"` here, deliberately. Every function below is a
 * pure function of its arguments — it reads no database, no environment and
 * no request — so a test can hand it a literal `Product[]` and assert on the
 * bytes and on the ETag. The guard exists to keep `mysql2` and a database
 * password out of a client bundle; there is nothing of that kind in this
 * file, so adding it would buy nothing and cost the direct test. The three
 * route handlers that call it are server-only by construction, and the two
 * query modules they read from carry the guard themselves.
 *
 * `node:crypto` is imported the way src/lib/crypto.ts imports it: hashing is
 * not a secret, and nothing outside a route handler imports this module.
 *
 * The type imports from `@/db/queries/reviews` are `import type`, so with
 * `isolatedModules` they are erased and no `server-only` module is pulled in
 * at runtime. They are imported rather than restated so that a column added
 * to `Review` shows up here as a compile error to think about.
 */

/** The document format's version. See the note in @ekmool/contracts/documents. */
const DOCUMENT_VERSION = 1;

/**
 * `must-revalidate` with `max-age=0`: a client may keep the copy forever and
 * must ask before reusing it. That ask is a conditional request carrying the
 * ETag below, and the answer is normally 304 with no body — the whole point.
 *
 * Not `s-maxage`. A shared cache holding these for a window would keep
 * serving the old catalogue after `revalidateCatalog()` had already purged
 * the origin, which turns an admin's stock edit into "the site did not save
 * my change" for as long as the window lasts. The origin's ISR entry is the
 * one cache with an invalidation story attached to it, so it is the only one
 * allowed to hold a copy.
 */
const DOCUMENT_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */

/**
 * The catalogue, exactly as `getCatalog()` produced it.
 *
 * `products` is passed straight through, and that is a decision rather than
 * laziness. Rule 5: nothing derived goes in this document — no "bestseller",
 * no "popular", no rating folded in from the reviews document. A ranking
 * field in a document nobody reviews is the easiest social proof there is to
 * fabricate, and once an app renders a badge off it there is nothing left
 * anywhere that records whether it was ever true.
 *
 * Rule 4 holds by doing nothing: `pricePaise` and `mrpPaise` are carried as
 * the columns hold them and no rupee conversion happens on this path.
 *
 * Stock goes in as it is, and it is up to an hour stale — the ISR window.
 * That is the same trade the web already takes (docs/PERFORMANCE.md: stock
 * display refreshes on the ISR window, correctness lives in the atomic
 * decrement at checkout, not in the display). So the app may show "3 left"
 * only when the number is literally 3, and its copy must not imply the
 * figure is live. It is not live here and it is not live on the site.
 */
export function toCatalogDocument(products: Product[]): CatalogDocument {
  return {
    version: DOCUMENT_VERSION,
    generatedAt: new Date().toISOString(),
    products,
  };
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */

/** One product's published reviews, as `getProductReviews(slug)` returned them. */
export interface ProductReviewsInput {
  slug: string;
  published: ProductReviews;
}

/**
 * `Review.createdAt` is a `Date` because `getProductReviews` now guarantees
 * it, and it did not always.
 *
 * `unstable_cache` stores its result as `JSON.stringify(result)` and returns
 * `JSON.parse(...)` on a hit, so the cached reader handed back a live `Date`
 * on a miss and an ISO string on a hit while its type claimed `Date` for
 * both. Writing this document was what surfaced it; the fix is in
 * `src/db/queries/reviews.ts`, which revives the dates outside the cache so
 * every existing caller's assumption is true again rather than only this
 * one's. This function can therefore take the declared type at its word —
 * but it takes it at its word *because* of that fix, not by luck, which is
 * why the fix is named here.
 */
function toIsoString(value: Date): string {
  return value.toISOString();
}

/**
 * A review as the product page already shows it to a logged-out visitor,
 * and nothing more.
 *
 * Checked against src/db/queries/reviews.ts rather than assumed: `Review`
 * carries id, productSlug, displayName, rating, title, body, createdAt.
 * `PendingReview` extends it with `customerEmail` and `orderId`, and is
 * produced only by `listReviewsForModeration` for /admin — neither field is
 * reachable from `getProductReviews`, which is the only reader this document
 * uses. The mapping is written out field by field anyway rather than
 * spread, so a column added to `Review` later cannot reach a phone by
 * accident; it has to be added here on purpose.
 *
 * `productSlug` is dropped because it is the key of the record this entry
 * sits under, and a repeated key is the one field that can ever disagree
 * with its own container.
 */
function toPublicReview(review: Review): PublicReview {
  return {
    id: review.id,
    displayName: review.displayName,
    rating: review.rating,
    title: review.title,
    body: review.body,
    createdAt: toIsoString(review.createdAt),
  };
}

/**
 * Published reviews for every catalogue slug, keyed by slug.
 *
 * Products with nothing published are present with `rating: null` and an
 * empty array rather than omitted — see the note on `ReviewsDocument`. Null
 * and not zero: rule 5, and the same distinction `getProductReviews` already
 * makes for the product page and the JSON-LD builder.
 *
 * Insertion order follows the catalogue's own order (`sort_order, id`), and
 * `getProductReviews` orders by `created_at DESC`. Both matter more than
 * they look: the ETag below is a hash of this object serialised, so a
 * non-deterministic order would mint a new validator on every regeneration
 * and quietly undo the whole bandwidth story.
 */
export function toReviewsDocument(
  perProduct: readonly ProductReviewsInput[],
): ReviewsDocument {
  const products: Record<string, ProductReviewsEntry> = {};

  for (const { slug, published } of perProduct) {
    products[slug] = {
      rating: published.rating,
      reviews: published.reviews.map(toPublicReview),
    };
  }

  return {
    version: DOCUMENT_VERSION,
    generatedAt: new Date().toISOString(),
    products,
  };
}

/* ------------------------------------------------------------------ */
/* Content                                                             */

/**
 * The merged content map — defaults with the admin's overrides on top,
 * which is exactly what `getContent()` returns and exactly what the site
 * renders. Same source, same strings, no second copy to diverge.
 */
export function toContentDocument(
  values: Readonly<Record<string, string>>,
): ContentDocument {
  return {
    version: DOCUMENT_VERSION,
    generatedAt: new Date().toISOString(),
    // Spread, so the document owns its own map and the `Readonly<…>` in the
    // signature is a promise this function keeps rather than a decoration.
    values: { ...values },
  };
}

/* ------------------------------------------------------------------ */
/* Serving: the ETag, and the 304 that cannot be answered here         */

interface StaticDocument {
  version: number;
  generatedAt: string;
}

/**
 * Serialise a document and wrap it in the response all three routes return.
 *
 * ── The ETag is a hash of the document MINUS `generatedAt` ──
 *
 * The header exists so that a customer opening the app four times a day
 * downloads the catalogue once. `generatedAt` fights that directly: these
 * routes are ISR with `revalidate = 3600`, so under traffic a document whose
 * data has not changed is still regenerated roughly hourly. Hash the whole
 * body and every one of those regenerations mints a new validator, every
 * install re-downloads, and the header has cost bandwidth instead of saving
 * it — which is the same failure the phase plan describes for a build id,
 * arrived at from the other direction.
 *
 * The alternative considered: keep `generatedAt` inside the hash and lean on
 * the fact that the handler runs once per generation, so the stamp is at
 * least stable *within* a generation. It is, and that is not the property
 * worth having. Stability within a generation is stability for exactly as
 * long as nothing regenerates — the case where the bytes were never going to
 * be re-fetched anyway. The value is in stability *across* regenerations
 * that changed nothing, and only excluding the stamp buys that.
 *
 * The worked consequence, which is the clearest argument for it: the reviews
 * route reads `getCatalog()` for its slug list, so its cache entry carries
 * the `products` tag as well as `reviews`, and an admin stock edit
 * regenerates it. With the stamp excluded that regeneration produces an
 * identical fingerprint and every phone still gets a 304. With it included,
 * every stock edit would push the entire review corpus to every install.
 *
 * The cost, stated plainly: two responses can now share an ETag and differ
 * in one field, which strictly makes this a weak validator that RFC 9110
 * would have written `W/"…"`. It is emitted strong regardless, for two
 * reasons. `If-None-Match` is defined to use the weak comparison function,
 * so the prefix changes nothing on the only path that reads it — it would
 * matter for range requests, and nothing issues a range request against a
 * JSON document. And nginx's gzip filter calls `ngx_http_weak_etag()`, so
 * anything served through docker/nginx.conf arrives at the client as
 * `W/"…"` whatever we wrote. `generatedAt` is also the one field a client
 * never acts on: it is there so support can ask how old a phone's copy is.
 *
 * The exclusion is a top-level destructure, not a `JSON.stringify` replacer.
 * A replacer runs at every depth and would silently drop a content key or a
 * product slug that happened to be called `generatedAt`.
 *
 * ── Why there is no 304 branch in here ──
 *
 * `If-None-Match` cannot be honoured by the handler, and the reason is
 * specific to `dynamic = "force-static"`. Next proxies the request object
 * for such a route and replaces its dynamic parts with empty stubs:
 * `forceStaticRequestHandlers` in
 * `next/dist/server/route-modules/app-route/module.js` returns
 * `HeadersAdapter.seal(new Headers({}))` for `request.headers`. So
 * `request.headers.get("if-none-match")` is `null` on every request,
 * forever, with no warning — the branch would compile, pass review, and
 * never once fire. And when the ISR entry is fresh the handler is not
 * invoked at all: `build/templates/app-route.js` replays the cached body
 * through `sendResponse`, which copies headers and pipes bytes and does not
 * look at `If-None-Match` either.
 *
 * The only way to make the branch work is to drop `force-static`, which
 * moves these three documents out of row one of docs/ARCHITECTURE.md's
 * rendering table and makes the app the first thing to fail when MySQL
 * stops — while the website beside it stays up. That trade is refused. The
 * static property is the point of the phase and it outranks the 304.
 *
 * So the handler publishes the validator and the layer in front does the
 * conditional. nginx's not-modified filter turns a matching `If-None-Match`
 * into a 304 for any proxied 200 carrying an ETag, and /catalog/* falls in
 * docker/nginx.conf's `location /` block; Vercel's CDN does the same. A bare
 * `next start` with nothing in front of it will answer 200 with the full
 * body every time. That is the documented gap, and it is the reason the edge
 * profile is not optional if the bandwidth story matters to you.
 */
export function documentResponse<T extends StaticDocument>(
  document: T,
): Response {
  const body = JSON.stringify(document);

  // Filtered entries rather than a destructured rest, which would bind a
  // `_generatedAt` nobody reads and trip no-unused-vars, and rather than a
  // cast to an index-signature type, which an interface does not satisfy.
  //
  // Top-level only, which is the point: `Object.entries` does not descend,
  // so a content key or product slug that happened to be called
  // `generatedAt` survives. A JSON.stringify replacer would have eaten it.
  // Key order is insertion order for string keys, so the fingerprint stays
  // deterministic across regenerations.
  const content = Object.fromEntries(
    Object.entries(document).filter(([key]) => key !== "generatedAt"),
  );

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(content), "utf8")
    .digest("hex")
    .slice(0, 32);

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      etag: `"${fingerprint}"`,
      "cache-control": DOCUMENT_CACHE_CONTROL,
    },
  });
}
