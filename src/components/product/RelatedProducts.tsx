import type { Product } from "@/db/queries/products";
import { getProductContent } from "@/content/products";
import { relatedProducts } from "@/lib/related";
import { ProductCard } from "./ProductCard";
import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * The rest of the shelf, ordered by a stated rule and labelled with it.
 *
 * The heading says what this is — five products, four of which are not the
 * one you are reading — rather than "customers also bought", which would be
 * a claim about data we do not have.
 */
export function RelatedProducts({
  catalog,
  current,
}: {
  catalog: Product[];
  current: Product;
}) {
  const related = relatedProducts(catalog, current);
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="related-heading">
      <Eyebrow as="h2">
        <span id="related-heading">The rest of the shelf</span>
      </Eyebrow>
      <p className="mt-5 max-w-[56ch] text-17 text-ek-green-700">
        We stock five things. Here are three of the other four, and why each
        one is next to this page.
      </p>
      <ul className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {related.map(({ product, reason }) => {
          const content = getProductContent(product.slug);
          return (
            <li key={product.slug} className="h-full">
              <ProductCard
                product={product}
                note={reason}
                artDirection={
                  content?.heroArtDirection ??
                  `Product photography for ${product.name}: overhead, warm natural light, regional props only.`
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
