import Link from "next/link";
import type { Product } from "@/db/queries/products";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";
import { AccentRule, OriginLabel } from "./OriginLabel";
import { formatPaise } from "@/lib/money";

/**
 * Catalogue card. Reads as a spice-tin label: paper field, hairline
 * border, accent rule at the top, price in Figtree 600.
 *
 * This file imports nothing from the client, on purpose. It used to pull
 * in WishlistButton directly, and a `showWishlist={false}` prop was not
 * enough to keep it off the home page: a client component referenced
 * anywhere in a route's server tree is bundled for that route whether it
 * renders or not, and the audit caught the 2.9 KB arriving on a page that
 * shows no save control. The button is passed in as `action` instead, so
 * the pages that want it pay for it and the ones that don't, don't.
 */
export function ProductCard({
  product,
  artDirection,
  /** A short reason this card is here — used by related products. */
  note,
  /**
   * The card's title element.
   *
   * `h2` on /products and /search, where the cards sit directly under the
   * page's h1. `h3` on the home page, where they sit under a section
   * heading that is itself an h2 — a card titled h2 there would be a
   * sibling of the heading introducing it, which reads to a screen reader
   * as a flat list of equals rather than a section with contents.
   */
  headingLevel = "h2",
  /**
   * A control that sits over the photograph — in practice, WishlistButton.
   *
   * Every catalogue surface passes one; the home page does not, and that
   * omission is the whole reason this is a prop. Header.tsx already
   * declines to show a saved-items count so the wishlist store does not
   * load site-wide, and putting the button on the busiest page would have
   * undone that decision by the back door. Home links to the product and
   * nothing else — the heart is one tap away on the page it belongs to.
   */
  action,
}: {
  product: Product;
  artDirection: string;
  note?: string;
  headingLevel?: "h2" | "h3";
  action?: React.ReactNode;
}) {
  const Heading = headingLevel;
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
      {action && (
        <div className="absolute top-3 right-3 z-10">{action}</div>
      )}
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
          <Heading className="mt-4 font-display text-26 text-ek-green-900 transition-colors group-hover:text-ek-gold-800">
            {product.name}
          </Heading>
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
