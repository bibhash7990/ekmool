"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { replaceWishlist, useWishlist, wishlistStore } from "@/lib/wishlist";

export interface WishlistEntry {
  slug: string;
  node: React.ReactNode;
}

/**
 * The saved-items page.
 *
 * This is the one place the browser copy and the server copy meet, and the
 * two directions are handled differently on purpose:
 *
 *  - **Arriving** merges. Both lists are real — the phone may have saved
 *    something an hour ago while signed out — so neither is allowed to
 *    delete the other.
 *  - **Removing, once here,** replaces. A removal on this page is an
 *    instruction, and merging it would put back exactly what was just
 *    taken out.
 *
 * A guest sees the same page working the same way, minus the round trips.
 * Nothing here asks anyone to sign in.
 */
export function WishlistView({
  signedIn,
  entries,
}: {
  signedIn: boolean;
  entries: WishlistEntry[];
}) {
  const saved = useWishlist();
  const [merging, setMerging] = useState(signedIn);

  /** Non-null once the server list is known; holds what was last sent. */
  const syncedRef = useRef<string | null>(null);
  const mergeStartedRef = useRef(false);

  useEffect(() => {
    if (!signedIn || mergeStartedRef.current) return;
    mergeStartedRef.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/account/wishlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slugs: [...wishlistStore.get()] }),
        });
        if (response.ok) {
          const data: { slugs?: unknown } = await response.json();
          if (Array.isArray(data.slugs)) {
            const slugs = data.slugs.filter(
              (value): value is string => typeof value === "string",
            );
            syncedRef.current = slugs.join(",");
            replaceWishlist(slugs);
          }
        }
      } catch {
        // Offline, or the database is down. The browser copy is still the
        // whole list as far as this page is concerned, so nothing is lost —
        // the merge simply happens on the next visit.
      } finally {
        setMerging(false);
      }
    })();
  }, [signedIn]);

  useEffect(() => {
    // syncedRef stays null until the merge lands, which is what stops a
    // removal made mid-merge from racing the merge that would undo it.
    if (!signedIn || syncedRef.current === null) return;
    const next = saved.join(",");
    if (next === syncedRef.current) return;
    syncedRef.current = next;

    void fetch("/api/account/wishlist", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slugs: [...saved] }),
    }).catch(() => {
      // Same reasoning: the browser copy is authoritative for this visit.
    });
  }, [signedIn, saved]);

  const visible = saved
    .map((slug) => entries.find((entry) => entry.slug === slug))
    .filter((entry): entry is WishlistEntry => entry !== undefined);

  if (visible.length === 0) {
    return (
      <section className="max-w-[56ch]">
        <p className="font-display text-26 text-ek-green-900">
          {merging ? "Fetching your saved list…" : "Nothing saved yet."}
        </p>
        {!merging && (
          <p className="mt-4 text-17 text-ek-green-700">
            The heart on any product keeps it here.{" "}
            <Link href="/products" className="link-draw text-ek-gold-800">
              Start with the shelf
            </Link>{" "}
            — there are only five things on it.
          </p>
        )}
      </section>
    );
  }

  return (
    <section aria-live="polite">
      <p className="text-15 text-ek-green-700">
        {visible.length} saved
        {signedIn
          ? " · kept on your account, so it follows you to a new phone"
          : " · kept in this browser. Find an order at /track and it moves to your account."}
      </p>
      <ul
        className={`mt-8 grid gap-x-8 gap-y-12 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${
          merging ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {visible.map((entry) => (
          <li key={entry.slug} className="h-full">
            {entry.node}
          </li>
        ))}
      </ul>
    </section>
  );
}
