import { createLocalStore, useLocalStore } from "@/lib/local-store";

/**
 * Recently viewed products.
 *
 * Entirely in the browser, and it stays that way. Nothing is sent anywhere,
 * nothing is written to the database, and no cookie carries it — which
 * means it needs no consent banner entry, because there is nothing to
 * consent to. A browsing history is one of the more revealing things a shop
 * can hold about someone; the version that never leaves their own device is
 * the one worth building.
 *
 * Slugs only. The names, prices and images come from the catalogue the page
 * already has, so a price change is never shown stale and the store cannot
 * outlive a product being retired.
 */

const MAX_ITEMS = 6;
const EMPTY: readonly string[] = Object.freeze([]);

export const recentlyViewedStore = createLocalStore<readonly string[]>({
  key: "ekmool.recent.v1",
  empty: EMPTY,
  parse: (raw) => {
    if (!Array.isArray(raw)) return null;
    return raw
      .filter(
        (value): value is string =>
          typeof value === "string" && /^[a-z0-9-]{1,120}$/.test(value),
      )
      .slice(0, MAX_ITEMS);
  },
});

/** Moves `slug` to the front, dropping any earlier visit to the same page. */
export function recordView(slug: string): void {
  const current = recentlyViewedStore.get();
  if (current[0] === slug) return; // A refresh is not a new visit.
  recentlyViewedStore.set(
    [slug, ...current.filter((s) => s !== slug)].slice(0, MAX_ITEMS),
  );
}

export function useRecentlyViewed(): readonly string[] {
  return useLocalStore(recentlyViewedStore);
}
