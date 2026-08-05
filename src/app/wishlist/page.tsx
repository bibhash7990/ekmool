import type { Metadata } from "next";

import { getCatalog } from "@/db/queries/products";
import { getProductContent } from "@/content/products";
import { getCustomerEmail } from "@/lib/account";
import { ProductCard } from "@/components/product/ProductCard";
import {
  WishlistView,
  type WishlistEntry,
} from "@/components/wishlist/WishlistView";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

/**
 * Saved items — for everyone, signed in or not.
 *
 * Dynamic only because it has to know whether there is a session; the
 * catalogue read underneath is the same cached one every static page uses.
 * A guest gets the full feature with no account, which is the same rule
 * that governs checkout.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved items",
  description:
    "The Ekmool products you have saved for later — kept in your browser, and on your account once you have looked up an order.",
  robots: { index: false, follow: true },
};

export default async function WishlistPage() {
  const [catalog, email] = await Promise.all([
    getCatalog(),
    getCustomerEmail(),
  ]);

  // Cards are rendered here and handed over as nodes; the client picks
  // which to show. Same pattern as /products — the card never becomes a
  // client component.
  const entries: WishlistEntry[] = catalog.map((product) => {
    const content = getProductContent(product.slug);
    return {
      slug: product.slug,
      node: (
        <ProductCard
          product={product}
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
      <Breadcrumbs items={[{ href: "/wishlist", label: "Saved" }]} />

      <header className="mt-10 max-w-2xl">
        <Eyebrow>Saved for later</Eyebrow>
        <h1 className="mt-5 font-display text-46 text-ek-green-900">
          Your list.
        </h1>
        <p className="mt-6 text-20 text-ek-green-700">
          Nothing is reserved and no price is held — this is a note to
          yourself, kept where you left it.
        </p>
      </header>

      <SoilLine align="left" className="my-12 max-w-sm" />

      <WishlistView signedIn={email !== null} entries={entries} />
    </div>
  );
}
