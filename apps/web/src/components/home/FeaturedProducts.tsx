import Link from "next/link";

import type { Product } from "@/db/queries/products";
import { getProductContent } from "@/content/products";
import { ProductCard } from "@/components/product/ProductCard";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

/**
 * The shelf, on the home page, with prices.
 *
 * Until now the home page never showed one. That was a deliberate
 * editorial choice and it was the wrong one: the single most common thing
 * a first-time visitor wants to know is what this costs, and making them
 * click through to find out is a tax on the majority to preserve a mood.
 *
 * Cards are rendered from the live catalogue rather than a hand-kept list,
 * so a price change in the admin reaches this section on the next purge
 * and a hardcoded "from ₹149" can never go stale here.
 *
 * No `action` is passed, so no save button and no client JavaScript: this
 * whole section is HTML. See the prop's note in ProductCard for why the
 * home page in particular declines it.
 */
export function FeaturedProducts({ products }: { products: Product[] }) {
  if (products.length === 0) return null;

  return (
    <section
      aria-labelledby="shelf-heading"
      className="border-y border-ek-green-200 bg-ek-cream"
    >
      <div className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Eyebrow as="h2">The shelf</Eyebrow>
            <p
              id="shelf-heading"
              className="mt-5 font-display text-34 text-ek-green-900 lg:text-46"
            >
              Five foods. Three pack sizes each.
            </p>
          </div>
          <Link
            href="/products"
            className="link-draw pb-2 text-17 text-ek-green-900"
          >
            Compare all fifteen
          </Link>
        </div>

        <ul className="mt-12 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, i) => {
            const content = getProductContent(product.slug);
            return (
              <Reveal as="li" key={product.slug} index={i} className="h-full">
                <ProductCard
                  product={product}
                  headingLevel="h3"
                  artDirection={
                    content?.heroArtDirection ??
                    `Product photography for ${product.name}: overhead, warm natural light, regional props only.`
                  }
                />
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
