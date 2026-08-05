import Link from "next/link";
import type { Product } from "@/db/queries/products";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { AccentRule, OriginLabel } from "./OriginLabel";
import { formatPaise } from "@/lib/money";

/**
 * Catalogue card. Reads as a spice-tin label: paper field, hairline
 * border, accent rule at the top, price in Figtree 600.
 */
export function ProductCard({
  product,
  artDirection,
  /** A short reason this card is here — used by related products. */
  note,
}: {
  product: Product;
  artDirection: string;
  note?: string;
}) {
  const cheapest = product.variants.reduce<number | null>(
    (min, v) => (min === null || v.pricePaise < min ? v.pricePaise : min),
    null,
  );
  const packRange = product.variants.map((v) => v.packSizeLabel).join(" · ");

  return (
    <article className="card-lift group relative h-full border border-ek-green-200 bg-ek-paper">
      <AccentRule accent={product.accent} />
      {/* Outside the Link, not inside it: a button nested in an anchor is
          invalid markup and gives screen readers two conflicting roles for
          one region. Absolutely positioned so it sits over the photo
          without the card needing a second layout. */}
      <WishlistButton
        slug={product.slug}
        productName={product.name}
        className="absolute top-3 right-3 z-10"
      />
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
          <h2 className="mt-4 font-display text-26 text-ek-green-900 transition-colors group-hover:text-ek-gold-800">
            {product.name}
          </h2>
          <p className="mt-2.5 text-15 text-ek-green-700">
            {product.shortDescription}
          </p>
          {note && (
            <p className="mt-3 border-l-2 border-ek-gold-500 pl-3 text-15 text-ek-green-700">
              {note}
            </p>
          )}
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
