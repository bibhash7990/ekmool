import Link from "next/link";
import type { Product } from "@/db/queries/products";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";
import { AccentRule, OriginLabel } from "./OriginLabel";
import { formatPaise } from "@/lib/money";

/**
 * Catalogue card. Reads as a spice-tin label: paper field, hairline
 * border, accent rule at the top, price in Figtree 600.
 */
export function ProductCard({
  product,
  artDirection,
}: {
  product: Product;
  artDirection: string;
}) {
  const cheapest = product.variants.reduce<number | null>(
    (min, v) => (min === null || v.pricePaise < min ? v.pricePaise : min),
    null,
  );
  const packRange = product.variants.map((v) => v.packSizeLabel).join(" · ");

  return (
    <article className="card-lift group h-full border border-ek-green-200 bg-ek-paper">
      <AccentRule accent={product.accent} />
      <Link href={`/products/${product.slug}`} className="block">
        <PhotoPlaceholder
          ratio="4 / 3"
          tone={product.accent}
          direction={artDirection}
          className="border-0 border-b border-ek-green-200"
        />
        <div className="p-5 lg:p-6">
          <OriginLabel
            originState={product.originState}
            giTagName={product.giTagName}
          />
          {/* h2: cards sit directly under the page h1 on /products */}
          <h2 className="mt-4 font-display text-26 text-ek-green-900 transition-colors group-hover:text-ek-gold-600">
            {product.name}
          </h2>
          <p className="mt-2.5 text-15 text-ek-green-700">
            {product.shortDescription}
          </p>
          <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-ek-green-200 pt-4">
            <span className="text-15 text-ek-green-700">{packRange}</span>
            {cheapest !== null && (
              <span className="text-20 font-semibold text-ek-green-900">
                from {formatPaise(cheapest)}
              </span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
