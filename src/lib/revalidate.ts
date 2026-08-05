import { revalidateTag, revalidatePath } from "next/cache";
import { PRODUCTS_TAG } from "@/db/queries/products";

/**
 * Invalidate everything that renders catalogue data.
 *
 * NEVER add `revalidatePath("/products/<slug>")` here.
 *
 * `/products/[slug]` sets `dynamicParams = false`, which compiles to
 * `fallback: false` in the prerender manifest. revalidatePath does not
 * mark such a path stale — it removes the prerendered entry outright, and
 * with no fallback Next has nothing left to serve or regenerate from. The
 * route then answers NoFallbackError, which surfaces as a 404, and it does
 * not recover: not when the request is retried, not when the database is
 * healthy, not on restart. Only a rebuild brings it back.
 *
 * That was live here. One call to /api/revalidate — or one stock edit in
 * /admin, which goes through this same function — 404'd all five product
 * pages permanently, with the database perfectly fine. Caught by the
 * forced-revalidation case in scripts/chaos.mjs, which now guards it.
 *
 * The tag is sufficient and is the correct mechanism. Every catalogue read
 * goes through `unstable_cache(..., { tags: [PRODUCTS_TAG] })`, so pages
 * that consumed it are marked stale and regenerate on the next request
 * while still serving the previous copy. Stale-while-revalidate is exactly
 * what we want: no gap where a shopper sees nothing.
 *
 * revalidatePath is kept only for the static routes, where regeneration
 * needs no path parameters and this failure mode does not exist.
 *
 * Call this from ADMIN and publish actions only — never on the checkout
 * path. Ordinary stock movement rides the hourly ISR window instead; the
 * atomic decrement in createOrder is what actually prevents overselling.
 */
export function revalidateCatalog(): void {
  revalidateTag(PRODUCTS_TAG, "max");
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/sitemap.xml");
}
