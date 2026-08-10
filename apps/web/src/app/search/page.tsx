import type { Metadata } from "next";
import Link from "next/link";

import { getCatalog, type Product } from "@/db/queries/products";
import { getProductContent } from "@/content/products";
import { searchCatalog, suggestCorrection } from "@ekmool/core/search";
import { ProductCard } from "@/components/product/ProductCard";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { SearchForm } from "@/components/search/SearchForm";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

/**
 * Search results.
 *
 * Dynamic, because the query is in the URL — but it costs no database
 * query: `getCatalog()` is the same hourly-cached read every static page
 * uses, so a thousand searches a second still resolve to about one SELECT
 * an hour.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Search Ekmool's GI-tagged single-origin foods — turmeric, makhana and chilli, by name, region or Indian name.",
  // Result pages are thin, near-duplicate, and infinite in number. Follow
  // so the product links still pass authority; never index the permutations.
  robots: { index: false, follow: true },
};

const MAX_QUERY_LENGTH = 80;

function ResultGrid({ products }: { products: Product[] }) {
  return (
    <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => {
        const content = getProductContent(product.slug);
        return (
          <li key={product.slug} className="h-full">
            <ProductCard
              product={product}
              action={
                <WishlistButton
                  slug={product.slug}
                  productName={product.name}
                />
              }
              artDirection={
                content?.heroArtDirection ??
                `Product photography for ${product.name}: overhead, warm natural light, regional props only.`
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  // A repeated ?q= arrives as an array. Take the first rather than joining,
  // which would silently search for something nobody typed.
  const raw = (Array.isArray(params.q) ? params.q[0] : params.q) ?? "";
  const query = raw.slice(0, MAX_QUERY_LENGTH).trim();

  // The catalogue read is cached, but /search is the one browsing page that
  // renders per request — so unlike the static pages it is exposed to a
  // cold cache during a database outage. Failing to a working shelf beats
  // failing to an error page.
  let catalog: Product[] = [];
  let catalogFailed = false;
  try {
    catalog = await getCatalog();
  } catch (error) {
    console.error("[search] catalogue unavailable:", error);
    catalogFailed = true;
  }

  const hits = query ? searchCatalog(catalog, query) : [];
  const correction =
    query && hits.length === 0 && !catalogFailed
      ? suggestCorrection(catalog, query)
      : null;

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8 lg:py-14">
      <Breadcrumbs
        items={[
          { href: "/products", label: "Shop" },
          { href: "/search", label: "Search" },
        ]}
      />

      <header className="mt-10 max-w-2xl">
        <Eyebrow>Search</Eyebrow>
        <h1 className="mt-5 font-display text-46 text-ek-green-900">
          {query ? <>Results for “{query}”</> : "Find your origin"}
        </h1>
        <SearchForm
          id="search-page-q"
          defaultValue={query}
          autoFocus={!query}
          className="mt-7 w-full max-w-xl"
        />
        <p className="mt-3 text-15 text-ek-green-700">
          Try the Indian name too — haldi, makhana, mirchi — or a district:
          Kandhamal, Lakadong, Guntur.
        </p>
      </header>

      <SoilLine align="left" className="my-12 max-w-sm" />

      {catalogFailed ? (
        <section aria-live="polite" className="max-w-2xl">
          <p className="font-display text-26 text-ek-green-900">
            Search is unavailable for a moment.
          </p>
          <p className="mt-4 text-17 text-ek-green-700">
            The shelf itself is fine —{" "}
            <Link href="/products" className="link-draw text-ek-gold-800">
              browse all five origins
            </Link>{" "}
            while we get this back.
          </p>
        </section>
      ) : !query ? (
        <section>
          <h2 className="eyebrow text-ek-green-700">Everything we sell</h2>
          <div className="mt-8">
            <ResultGrid products={catalog} />
          </div>
        </section>
      ) : hits.length > 0 ? (
        <section>
          <h2 className="eyebrow text-ek-green-700" aria-live="polite">
            {hits.length} {hits.length === 1 ? "product" : "products"}
          </h2>
          <div className="mt-8">
            <ResultGrid products={hits.map((hit) => hit.product)} />
          </div>
        </section>
      ) : (
        <section>
          <h2 className="font-display text-34 text-ek-green-900" aria-live="polite">
            Nothing matched “{query}”.
          </h2>

          {correction && (
            <p className="mt-5 text-20 text-ek-green-700">
              Did you mean{" "}
              <Link
                href={`/search?q=${encodeURIComponent(correction)}`}
                className="link-draw text-ek-gold-800"
              >
                {correction}
              </Link>
              ?
            </p>
          )}

          <p className="mt-5 max-w-[60ch] text-17 text-ek-green-700">
            We keep a deliberately short shelf: five GI-tagged foods, nothing
            blended and nothing bought in. If you were looking for something
            else, it is not that we are out of it — we do not stock it.
          </p>

          <div className="mt-12">
            <h3 className="eyebrow text-ek-green-700">What we do have</h3>
            <div className="mt-8">
              <ResultGrid products={catalog} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
