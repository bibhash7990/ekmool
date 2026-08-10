"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Filtering and sorting for /products, driven entirely by the URL.
 *
 * The cards are *not* re-rendered here. They arrive already rendered, as
 * server components handed in on `items[].node`, and this decides which of
 * them to show and in what order. That is what keeps the product card, the
 * photo placeholder and the price formatter out of the browser bundle: the
 * only thing that had to become client-side is the choosing.
 *
 * And the page stays static. Reading `searchParams` in the server component
 * would opt /products into dynamic rendering, and static browsing is this
 * site's entire load story — 30,000 page views on ~11 database queries. A
 * filter is not worth trading that for, so the query string is read on the
 * client, inside a Suspense boundary, and the prerendered HTML still ships
 * every product for crawlers and for anyone whose JavaScript never arrives.
 */

export interface CatalogItem {
  slug: string;
  name: string;
  /** turmeric / makhana / chilli — derived server-side from the name. */
  family: string | null;
  originState: string;
  packLabels: string[];
  /** Cheapest variant, for price sorting. */
  fromPaise: number;
  node: React.ReactNode;
}

export type SortKey = "featured" | "price-asc" | "price-desc" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "name", label: "Name A–Z" },
];

/** URL value ↔ display value. Lowercased, spaces to hyphens. */
function toParam(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function FilterRow({
  legend,
  param,
  options,
  active,
  hrefFor,
}: {
  legend: string;
  param: string;
  options: { value: string; label: string; count: number }[];
  active: string | null;
  hrefFor: (param: string, value: string | null) => string;
}) {
  if (options.length < 2) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <span className="eyebrow w-24 shrink-0 text-ek-green-700">{legend}</span>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={hrefFor(param, null)}
            replace
            scroll={false}
            prefetch={false}
            aria-current={active === null ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-sm border px-3.5 text-15 transition-colors ${
              active === null
                ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
            }`}
          >
            All
          </Link>
        </li>
        {options.map((option) => {
          const isActive = active === option.value;
          return (
            <li key={option.value}>
              <Link
                href={hrefFor(param, option.value)}
                replace
                scroll={false}
                prefetch={false}
                aria-current={isActive ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-sm border px-3.5 text-15 transition-colors ${
                  isActive
                    ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                    : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
                }`}
              >
                {option.label}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {option.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CatalogGrid({ items }: { items: CatalogItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const family = searchParams.get("family");
  const origin = searchParams.get("origin");
  const pack = searchParams.get("pack");
  const sortParam = searchParams.get("sort");
  const sort: SortKey =
    SORTS.find((s) => s.key === sortParam)?.key ?? "featured";

  function hrefFor(param: string, value: string | null): string {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(param);
    else next.set(param, value);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  const { visible, familyOptions, originOptions, packOptions } = useMemo(() => {
    /**
     * Counts are computed against everything *except* the facet being
     * counted, so the number beside "Turmeric" is how many products you
     * would see if you clicked it — not how many are showing now. A facet
     * that counts itself always reads 0 for every option you have not
     * chosen, which teaches people the filters are broken.
     */
    const matches = (
      item: CatalogItem,
      ignore: "family" | "origin" | "pack" | null,
    ) =>
      (ignore === "family" || !family || item.family === family) &&
      (ignore === "origin" || !origin || toParam(item.originState) === origin) &&
      (ignore === "pack" ||
        !pack ||
        item.packLabels.some((label) => toParam(label) === pack));

    const countBy = (
      ignore: "family" | "origin" | "pack",
      valuesOf: (item: CatalogItem) => { value: string; label: string }[],
    ) => {
      const counts = new Map<string, { label: string; count: number }>();
      for (const item of items) {
        if (!matches(item, ignore)) continue;
        for (const { value, label } of valuesOf(item)) {
          const entry = counts.get(value) ?? { label, count: 0 };
          entry.count += 1;
          counts.set(value, entry);
        }
      }
      return [...counts]
        .map(([value, { label, count }]) => ({ value, label, count }))
        .sort((a, b) => a.label.localeCompare(b.label));
    };

    const filtered = items.filter((item) => matches(item, null));

    const sorted = [...filtered];
    if (sort === "price-asc") sorted.sort((a, b) => a.fromPaise - b.fromPaise);
    else if (sort === "price-desc") sorted.sort((a, b) => b.fromPaise - a.fromPaise);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    // "featured" is the order the catalogue came in, which is the order the
    // owner set — so it is the absence of a sort, not another one.

    return {
      visible: sorted,
      familyOptions: countBy("family", (item) =>
        item.family
          ? [
              {
                value: item.family,
                label: item.family[0].toUpperCase() + item.family.slice(1),
              },
            ]
          : [],
      ),
      originOptions: countBy("origin", (item) => [
        { value: toParam(item.originState), label: item.originState },
      ]),
      packOptions: countBy("pack", (item) =>
        item.packLabels.map((label) => ({ value: toParam(label), label })),
      ),
    };
  }, [items, family, origin, pack, sort]);

  const filtersApplied = Boolean(family || origin || pack);

  return (
    <div>
      <section
        aria-label="Filter and sort"
        className="border-y border-ek-green-200 py-6"
      >
        <div className="flex flex-col gap-4">
          <FilterRow
            legend="Food"
            param="family"
            options={familyOptions}
            active={family}
            hrefFor={hrefFor}
          />
          <FilterRow
            legend="Origin"
            param="origin"
            options={originOptions}
            active={origin}
            hrefFor={hrefFor}
          />
          <FilterRow
            legend="Pack size"
            param="pack"
            options={packOptions}
            active={pack}
            hrefFor={hrefFor}
          />

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <span className="eyebrow w-24 shrink-0 text-ek-green-700">Sort</span>
            <ul className="flex flex-wrap gap-2">
              {SORTS.map((option) => {
                const isActive = sort === option.key;
                return (
                  <li key={option.key}>
                    <Link
                      href={hrefFor(
                        "sort",
                        option.key === "featured" ? null : option.key,
                      )}
                      replace
                      scroll={false}
                      prefetch={false}
                      aria-current={isActive ? "true" : undefined}
                      className={`inline-flex min-h-11 items-center rounded-sm border px-3.5 text-15 transition-colors ${
                        isActive
                          ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                          : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
                      }`}
                    >
                      {option.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <p className="mt-8 text-15 text-ek-green-700" aria-live="polite">
        Showing {visible.length} of {items.length}
        {filtersApplied && (
          <>
            {" · "}
            <Link href={pathname} replace scroll={false} prefetch={false} className="link-draw">
              Clear filters
            </Link>
          </>
        )}
      </p>

      {visible.length === 0 ? (
        <p className="mt-10 max-w-[52ch] text-17 text-ek-green-700">
          Nothing on the shelf matches that combination.{" "}
          <Link href={pathname} replace scroll={false} prefetch={false} className="link-draw text-ek-gold-800">
            Clear the filters
          </Link>{" "}
          to see all five origins.
        </p>
      ) : (
        <ul className="mt-6 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <li key={item.slug} className="h-full">
              {item.node}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
