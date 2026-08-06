import type { Metadata } from "next";
import { Suspense } from "react";

import { getCatalog } from "@/db/queries/products";
import { getProductContent } from "@/content/products";
import { familyOf } from "@/lib/related";
import { ProductCard } from "@/components/product/ProductCard";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { CatalogGrid, type CatalogItem } from "@/components/product/CatalogGrid";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { TrustStrip } from "@/components/home/TrustStrip";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Shop GI-Tagged Single-Origin Spices & Makhana",
  description:
    "Shop all five Ekmool origins: Kandhamal and Lakadong turmeric, Mithila makhana, Guntur and Byadagi chilli. GI-tagged, single-origin, milled in small batches.",
  alternates: { canonical: "/products" },
  openGraph: {
    url: "/products",
    title: "Shop GI-Tagged Single-Origin Spices & Makhana | Ekmool",
    description:
      "Five GI-tagged foods from five Indian districts — turmeric, makhana and chilli, traced to origin and milled in small batches.",
  },
};

export default async function ProductsPage() {
  const products = await getCatalog();

  // Cards are rendered here, on the server, and handed to the client grid
  // as nodes. The grid decides what to show; it never rebuilds a card.
  const items: CatalogItem[] = products.map((product) => {
    const content = getProductContent(product.slug);
    return {
      slug: product.slug,
      name: product.name,
      family: familyOf(product),
      originState: product.originState,
      packLabels: product.variants.map((v) => v.packSizeLabel),
      fromPaise: Math.min(...product.variants.map((v) => v.pricePaise)),
      node: (
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
      ),
    };
  });

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ href: "/products", label: "Shop" }]} />

      <header className="mt-10 max-w-2xl">
        <Eyebrow>Five origins · Fifteen pack sizes</Eyebrow>
        <h1 className="mt-5 font-display text-46 text-ek-green-900 lg:text-64">
          The whole shelf.
        </h1>
        <p className="mt-6 text-20 text-ek-green-700">
          Everything we sell carries a Geographical Indication and comes from
          the district that earned it. No blends, no house masalas, no
          substitutions when a season runs short.
        </p>
      </header>

      <SoilLine align="left" className="my-12 max-w-sm" />

      {/*
        useSearchParams needs a Suspense boundary for the page to prerender.
        The fallback is the full, unfiltered grid — so the static HTML a
        crawler or a JS-less browser gets is every product, which is exactly
        what /products should be when nothing has been chosen.
      */}
      <Suspense
        fallback={
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.slug} className="h-full">
                {item.node}
              </li>
            ))}
          </ul>
        }
      >
        <CatalogGrid items={items} />
      </Suspense>

      <div className="mt-20 border-t border-ek-green-200 pt-10">
        <TrustStrip className="max-w-3xl" />
      </div>
    </div>
  );
}
