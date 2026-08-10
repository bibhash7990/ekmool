import { createLocalStore, useLocalStore } from "@/lib/local-store";

/**
 * The wishlist, client side.
 *
 * localStorage is the working copy for everyone, signed in or not, and that
 * is deliberate: a guest here is not a lesser customer — checkout never
 * asks anyone to register — so saving something must work identically with
 * no account at all.
 *
 * The server copy (customers → wishlist_items) exists so a list survives a
 * new phone. It is reconciled at exactly one point: opening /wishlist while
 * holding a session. The heart on a product page never talks to the server,
 * which is what keeps the product page static and keeps a guest's clicks
 * from becoming origin traffic.
 *
 * Known limit, accepted rather than hidden: reconciliation is a union. Take
 * two signed-in devices; remove an item on one, and if the other still has
 * it locally, its next visit to /wishlist puts it back. Fixing that
 * properly means tombstones and a clock, which is a real amount of
 * machinery for a saved-items list. If it ever matters, this is the seam.
 */

/** Same cap as the catalogue can plausibly reach; guards a poisoned store. */
const MAX_ITEMS = 100;
const EMPTY: readonly string[] = Object.freeze([]);

function parseSlugs(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const slugs = raw.filter(
    (value): value is string =>
      typeof value === "string" && /^[a-z0-9-]{1,120}$/.test(value),
  );
  return slugs.slice(0, MAX_ITEMS);
}

export const wishlistStore = createLocalStore<readonly string[]>({
  key: "ekmool.wishlist.v1",
  empty: EMPTY,
  parse: parseSlugs,
});

export function toggleWishlist(slug: string): boolean {
  const current = wishlistStore.get();
  const saved = current.includes(slug);
  // Newest first, so /wishlist reads in the order things were saved.
  wishlistStore.set(
    saved ? current.filter((s) => s !== slug) : [slug, ...current].slice(0, MAX_ITEMS),
  );
  return !saved;
}

export function removeFromWishlist(slug: string): void {
  wishlistStore.set(wishlistStore.get().filter((s) => s !== slug));
}

export function replaceWishlist(slugs: string[]): void {
  wishlistStore.set(parseSlugs(slugs) ?? []);
}

/** Subscribes to the list. Returns `EMPTY` on the server and before hydration. */
export function useWishlist(): readonly string[] {
  return useLocalStore(wishlistStore);
}
