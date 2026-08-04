import type { Metadata } from "next";

import { getCatalog } from "@/db/queries/products";
import { getProductContent } from "@/content/products";
import { ProductCard } from "@/components/product/ProductCard";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { Reveal } from "@/components/ui/Reveal";
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

      <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product, i) => {
          const content = getProductContent(product.slug);
          return (
            <Reveal as="li" key={product.slug} index={i} className="h-full">
              <ProductCard
                product={product}
                artDirection={
                  content?.heroArtDirection ??
                  `Product photography for ${product.name}: overhead, warm natural light, regional props only.`
                }
              />
            </Reveal>
          );
        })}
      </ul>

      <div className="mt-20 border-t border-ek-green-200 pt-10">
        <TrustStrip className="max-w-3xl" />
      </div>
    </div>
  );
}
