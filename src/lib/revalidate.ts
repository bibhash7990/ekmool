import { revalidateTag, revalidatePath } from "next/cache";
import { PRODUCTS_TAG } from "@/db/queries/products";
import { REVIEWS_TAG } from "@/db/queries/reviews";
import {
  PURGE_CHANNEL,
  instanceId,
  type PurgeKind,
  type PurgeMessage,
} from "@/lib/purge-channel";

/**
 * Invalidate everything that renders catalogue data.
 *
 * NEVER add `revalidatePath("/products/<slug>")` here.
 *
 * The tag is the mechanism. It marks pages stale and keeps serving the
 * previous copy while they regenerate, which is what we want — no gap
 * where a shopper sees nothing. A path purge deletes the prerendered entry
 * outright instead.
 *
 * While `/products/[slug]` also set `dynamicParams = false` that was not
 * merely wrong, it was unrecoverable: with `fallback: false` there was
 * nothing left to serve or regenerate from, so the route answered
 * NoFallbackError, which surfaces as a 404 and does not come back — not on
 * retry, not on restart, only on a rebuild. It was live here. One call to
 * /api/revalidate, or one stock edit in /admin, 404'd all five product
 * pages with the database perfectly healthy. Caught by the forced-
 * revalidation case in scripts/chaos.mjs, which guards it still.
 *
 * M14 set `dynamicParams = true` so a product created in the admin has a
 * page, which as a side effect means a path purge would now recover. The
 * rule stands anyway: the reason for preferring the tag never depended on
 * the bug.
 *
 * revalidatePath is kept only for the static routes, where regeneration
 * needs no path parameters and this failure mode does not exist.
 *
 * Call this from ADMIN and publish actions only — never on the checkout
 * path. Ordinary stock movement rides the hourly ISR window instead; the
 * atomic decrement in createOrder is what actually prevents overselling.
 */
export function revalidateCatalog(options?: PurgeOptions): void {
  revalidateTag(PRODUCTS_TAG, "max");
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/sitemap.xml");
  broadcast("catalog", options);
}

/**
 * Publishing or rejecting a review. Its own tag and its own function,
 * because the two invalidations are not the same event and should not
 * become one: moderating a review must not purge the catalogue cache and
 * send every product page back to the database.
 *
 * Same rule as above applies and is the reason there is no revalidatePath
 * for the product routes here either.
 */
export function revalidateReviews(options?: PurgeOptions): void {
  revalidateTag(REVIEWS_TAG, "max");
  broadcast("reviews", options);
}

/* ------------------------------------------------------------------ */
/* Fanning a purge out to the other instances                          */

export interface PurgeOptions {
  /**
   * False when this purge *arrived* from another instance. Without it two
   * containers would forward the same purge to each other forever.
   */
  broadcast?: boolean;
}

/**
 * Next's cache lives in the process that holds it.
 *
 * On one container that is invisible. On four, an admin publishing a
 * product purges the cache of whichever container happened to serve the
 * form — and the other three keep serving the old catalogue for up to an
 * hour, which reads as "the site did not save my change" and is the kind
 * of bug an owner reports as a ghost.
 *
 * So the purge is announced on a Redis channel and every instance repeats
 * it locally. Best effort by design: Redis being down means the purge is
 * merely local again, which is where it was before, and is not a reason to
 * fail the admin action that triggered it.
 */
function broadcast(kind: PurgeKind, options?: PurgeOptions): void {
  if (options?.broadcast === false) return;

  // Imported lazily. This module is pulled into pages that must build with
  // no Redis and no ioredis resolution at all.
  void import("@/lib/redis")
    .then(async ({ getRedis, hasRedis }) => {
      if (!hasRedis) return;
      const client = getRedis();
      if (!client) return;
      const message: PurgeMessage = {
        kind,
        origin: instanceId(),
        at: Date.now(),
      };
      await client.publish(PURGE_CHANNEL, JSON.stringify(message));
    })
    .catch((error: unknown) => {
      console.error(
        "[revalidate] could not announce the purge:",
        error instanceof Error ? error.message : error,
      );
    });
}
