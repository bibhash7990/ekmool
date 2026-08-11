import { useSyncExternalStore } from "react";
import { Storage } from "expo-sqlite/kv-store";

import { apiGet, apiPost, apiRequest, type ApiResult } from "@/api/client";
import { loadSession, peekSession } from "@/lib/session";

/**
 * Saved items — the phone's copy, and its reconciliation with the account.
 *
 * ── The rule that shapes this module ──
 *
 * **The device copy is the working copy for everybody**, signed in or not.
 * That is the same decision `apps/web/src/lib/wishlist.ts` records, and the
 * reason carries over word for word: a customer without a session is not a
 * lesser customer here, because checkout never asks anyone to register
 * (rule 7). Saving something has to work identically with no account at all.
 *
 * **Nothing in this module, and nothing in any screen that uses it, may
 * offer "sign in to save your list" as a reason to identify.** A wishlist
 * that needs an account to work is registration with the word registration
 * removed, and rule 7 says there is no registration and there never will be
 * one. The server copy exists so a list survives a new phone for someone who
 * *already* has a session from looking up an order. It is a consequence of
 * having identified, never a reason to.
 *
 * ── Where it is stored ──
 *
 * `expo-sqlite/kv-store`, already inside `expo-sqlite`, already in the SDK,
 * no new native module (rule 12). SecureStore is deliberately not used: a
 * list of five public product slugs is worth nothing to anybody, and the
 * keystore is for the session token. Same split as the cart, and for the
 * same reason — see `src/store/cart-persistence.ts`.
 *
 * The read is **synchronous** (`getItemSync`), which is the whole reason the
 * Saved tab's first frame already has the list in it. `useCachedDocument`
 * makes the same trade for the catalogue and writes up why at length: an
 * async read puts an empty frame in front of every returning customer and
 * gives it back only when somebody measures.
 */

/* ------------------------------------------------------------------ */
/* The device copy                                                     */

/**
 * The same key name the web uses in `localStorage`.
 *
 * They are different stores on different devices and will never collide, so
 * this buys nothing at runtime. It buys a support conversation: one name for
 * "the saved list", greppable across both clients.
 */
const STORAGE_KEY = "ekmool.wishlist.v1";

/**
 * The server caps the array at 100 (`mergeSchema` in
 * `apps/web/src/app/api/account/wishlist/route.ts`). Matching it here means a
 * poisoned or ancient store is trimmed before it becomes a 422 the customer
 * cannot act on.
 */
const MAX_ITEMS = 100;

/** The server's own slug shape, restated so a bad slug never leaves the phone. */
const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * Frozen, and one instance.
 *
 * `useSyncExternalStore` compares snapshots by reference and re-renders when
 * they differ. A fresh `[]` from every read of an empty list would be a new
 * reference every time, which is an infinite render loop rather than a
 * performance note.
 */
const EMPTY: readonly string[] = Object.freeze([]);

/** `null` until the first read. Not the same as "read, and empty". */
let current: readonly string[] | null = null;

const listeners = new Set<() => void>();

function parseSlugs(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return EMPTY;
  const slugs = raw.filter(
    (value): value is string => typeof value === "string" && SLUG.test(value),
  );
  // De-duplicated on read rather than trusted: a merge response and a local
  // toggle can both name the same slug, and a duplicate key in a list is a
  // React warning at best and a wrong count at worst.
  const unique = [...new Set(slugs)].slice(0, MAX_ITEMS);
  return unique.length === 0 ? EMPTY : Object.freeze(unique);
}

function read(): readonly string[] {
  if (current !== null) return current;
  try {
    const raw = Storage.getItemSync(STORAGE_KEY);
    current = raw === null || raw.length === 0 ? EMPTY : parseSlugs(JSON.parse(raw));
  } catch {
    // A corrupt or locked store reads as an empty list, which is a state the
    // screen already draws. Throwing here would throw during render, because
    // this runs inside `useSyncExternalStore`'s snapshot callback.
    current = EMPTY;
  }
  return current;
}

function write(next: readonly string[]): void {
  current = next;
  // Not awaited. The list is already in memory and on screen; this write is
  // for the next launch. A failure costs a list that does not survive a
  // force-quit, which is a smaller harm than an unhandled rejection on every
  // tap of a heart.
  void Storage.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  for (const listener of listeners) listener();
}

/** The saved slugs, newest first. Synchronous and safe during render. */
export function readWishlist(): readonly string[] {
  return read();
}

export function isSaved(slug: string): boolean {
  return read().includes(slug);
}

/**
 * Sends the device list to the account after a removal.
 *
 * Fire-and-forget on purpose. The device copy is the working copy, it is
 * already drawn, and the tap has already taken effect — making the customer
 * wait on a network round trip to see a heart turn grey would be a worse
 * screen for no gain. A failure costs one thing: the slug reappears at the
 * next merge, which is exactly the behaviour this function exists to fix, so
 * it is a degradation back to the old defect rather than a new one.
 *
 * `loadSession` is awaited rather than trusting `peekSession`, because a
 * removal can happen on the product screen before anything has read the
 * keystore. Deciding "guest" from an unread keystore would skip the push and
 * let the union restore the slug — the precise bug being closed.
 *
 * An addition never needs this: the merge on open is a union and carries
 * additions by itself.
 */
async function pushRemovalToAccount(): Promise<void> {
  if (!peekSession() && !(await loadSession())) return;
  await replaceServerWishlist(read());
}

/** Adds or removes. Returns the state the slug is now in. */
export function toggleWishlist(slug: string): boolean {
  if (!SLUG.test(slug)) return false;
  const list = read();
  const saved = list.includes(slug);
  // Newest first, so the Saved screen reads in the order things were saved —
  // the same order the web's /wishlist uses.
  write(
    saved
      ? Object.freeze(list.filter((entry) => entry !== slug))
      : Object.freeze([slug, ...list].slice(0, MAX_ITEMS)),
  );
  if (saved) void pushRemovalToAccount();
  return !saved;
}

export function removeFromWishlist(slug: string): void {
  const list = read();
  if (!list.includes(slug)) return;
  write(Object.freeze(list.filter((entry) => entry !== slug)));
  void pushRemovalToAccount();
}

/** Replaces the device copy — used only by the merge below. */
function replaceLocalWishlist(slugs: readonly string[]): void {
  write(parseSlugs(slugs));
}

export function subscribeToWishlist(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The saved list, as a hook.
 *
 * `useSyncExternalStore` rather than a Redux slice: the cart is in Redux
 * because its arithmetic is shared with the web through `@ekmool/core`, and
 * a list of slugs has no arithmetic. Adding a second slice, a second
 * persistence listener and a second set of selectors to hold five strings
 * would be machinery with nothing in it.
 */
export function useWishlist(): readonly string[] {
  return useSyncExternalStore(subscribeToWishlist, read);
}

/* ------------------------------------------------------------------ */
/* The account copy                                                    */

/**
 * `{ slugs: string[] }` — the 200 body of every verb on
 * `/api/account/wishlist`, read from the route rather than assumed.
 *
 * Typed as `unknown` inside and narrowed by `parseSlugs`, because the value
 * came out of `JSON.parse` where a type is a claim and not a fact.
 */
interface WishlistBody {
  slugs?: unknown;
}

const WISHLIST_PATH = "/api/account/wishlist";

/**
 * The account's list. 401 for a guest, which is not an error worth showing:
 * for somebody without a session the device copy *is* the whole list.
 */
export async function fetchServerWishlist(): Promise<ApiResult<readonly string[]>> {
  const result = await apiGet<WishlistBody>(WISHLIST_PATH);
  if (!result.ok) return result;
  return { ok: true, data: parseSlugs(result.data.slugs) };
}

/**
 * POST is a **union**, not a replace, and the server's own comment says why:
 * the phone's list and the account's list are both real, so neither may
 * delete the other. Somebody saves two things on a train with no signal;
 * those two must survive meeting an account that already has three.
 */
export async function mergeServerWishlist(
  slugs: readonly string[],
): Promise<ApiResult<readonly string[]>> {
  const result = await apiPost<WishlistBody>(WISHLIST_PATH, {
    slugs: [...slugs].slice(0, MAX_ITEMS),
  });
  if (!result.ok) return result;
  return { ok: true, data: parseSlugs(result.data.slugs) };
}

/**
 * PUT is a **replace**, and it is what carries a removal.
 *
 * The union above cannot: by construction it can only add, so a slug taken
 * off the list on the phone came straight back at the next merge, which
 * reads as the app ignoring the tap. Replace is the same verb the web uses
 * for the same reason.
 *
 * It is only safe to send because the device copy has already been
 * reconciled with the account — `syncWishlistOnOpen` merges on open, so by
 * the time anyone can remove something, what is on the device is the union
 * of both lists rather than a partial view that would silently delete the
 * account's half.
 */
export async function replaceServerWishlist(
  slugs: readonly string[],
): Promise<ApiResult<readonly string[]>> {
  const result = await apiRequest<WishlistBody>(WISHLIST_PATH, {
    method: "PUT",
    body: { slugs: [...slugs].slice(0, MAX_ITEMS) },
  });
  if (!result.ok) return result;
  return { ok: true, data: parseSlugs(result.data.slugs) };
}

/**
 * What the Saved screen calls when it opens.
 *
 * Returns `null` when there is no session — not a failure, because a guest
 * has nothing to reconcile with and the device copy is already correct and
 * already on screen. `loadSession` is awaited first so a cold start does not
 * decide "guest" from a keystore that has simply not been read yet;
 * `peekSession` alone is an optimisation and says so in its own doc comment.
 */
export async function syncWishlistOnOpen(): Promise<ApiResult<readonly string[]> | null> {
  if (!peekSession() && !(await loadSession())) return null;

  const result = await mergeServerWishlist(read());
  if (!result.ok) {
    // Offline, or the database is down. Nothing is lost: the device copy is
    // the working copy, it is already drawn, and the merge happens next time.
    // A guest whose token expired mid-session lands here as NO_SESSION, which
    // is also nothing to report — the client has already cleared the token.
    return result;
  }

  replaceLocalWishlist(result.data);
  return result;
}
