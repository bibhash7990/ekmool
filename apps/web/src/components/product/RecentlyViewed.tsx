"use client";

import { useEffect } from "react";
import Link from "next/link";
import { recordView, useRecentlyViewed } from "@/lib/recently-viewed";
import { formatPaise } from "@/lib/money";

export interface RecentEntry {
  slug: string;
  name: string;
  originState: string;
  fromPaise: number;
}

/**
 * Recently viewed, on the product page.
 *
 * Records the current visit and renders the earlier ones. The catalogue
 * index is passed in from the server — the store holds slugs only, so a
 * price shown here is always today's price and a retired product simply
 * stops appearing.
 *
 * Renders nothing until there is a second product to show. A "recently
 * viewed" rail listing the page you are looking at is noise, and one that
 * reserves space for an empty list is worse.
 */
export function RecentlyViewed({
  currentSlug,
  catalog,
}: {
  currentSlug: string;
  catalog: RecentEntry[];
}) {
  const recent = useRecentlyViewed();

  useEffect(() => {
    recordView(currentSlug);
  }, [currentSlug]);

  const entries = recent
    .filter((slug) => slug !== currentSlug)
    .map((slug) => catalog.find((entry) => entry.slug === slug))
    .filter((entry): entry is RecentEntry => entry !== undefined)
    .slice(0, 4);

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="mt-16 lg:mt-24">
      <h2 id="recent-heading" className="eyebrow text-ek-green-700">
        You looked at
      </h2>
      <ul className="mt-6 flex flex-wrap gap-3">
        {entries.map((entry) => (
          <li key={entry.slug}>
            <Link
              href={`/products/${entry.slug}`}
              prefetch={false}
              className="flex min-h-11 flex-col justify-center border border-ek-green-200 px-4 py-2 transition-colors hover:border-ek-green-700"
            >
              <span className="text-15 text-ek-green-900">{entry.name}</span>
              <span className="text-15 text-ek-green-700">
                {entry.originState} · from {formatPaise(entry.fromPaise)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
