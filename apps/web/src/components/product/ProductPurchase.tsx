"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAppDispatch } from "@/store/hooks";
import { itemAdded, type CartItem } from "@/store/cart-slice";
import { Button } from "@/components/ui/Button";
import { WishlistButton } from "@/components/wishlist/WishlistButton";
import { PincodeCheck } from "@/components/shipping/PincodeCheck";
import { formatPaise } from "@/lib/money";
import { track } from "@/lib/analytics";

/**
 * Deferred because it is markup for a state that is almost always false —
 * and it drags the Turnstile widget and next/script in with it. Charging
 * every product page view for the one case where a pack has run out is
 * backwards. Server rendering stays on, so when a pack *is* out of stock
 * the form is in the prerendered HTML and only its behaviour arrives late.
 *
 * Worth knowing before reaching for this again: **`next/dynamic` only saves
 * bytes when the component does not render.** It was tried on the PIN code
 * checker too, which is on every product page, and the page got 2 KB
 * *heavier* — the chunk is requested anyway and the split adds its own
 * wrapper. Deferring something that renders buys a round trip, not a
 * saving. This one earns it because `outOfStock` is normally false and the
 * chunk is then never asked for at all.
 */
const BackInStockForm = dynamic(() =>
  import("./BackInStockForm").then((module) => module.BackInStockForm),
);

export interface PurchaseVariant {
  id: number;
  sku: string;
  packSizeLabel: string;
  packSizeGrams: number;
  pricePaise: number;
  mrpPaise: number;
  stockQty: number;
  lowStockThreshold: number;
}

/**
 * The only interactive island on a product page: variant selection,
 * quantity, add-to-cart, plus the mobile sticky bar (which shares this
 * state so the two can never disagree).
 *
 * Layout is fixed-height where values change, so swapping a variant
 * never shifts the page.
 */
export function ProductPurchase({
  productSlug,
  productName,
  accent,
  variants,
  turnstileSiteKey = "",
}: {
  productSlug: string;
  productName: string;
  accent: "gold" | "terracotta" | "green";
  variants: PurchaseVariant[];
  turnstileSiteKey?: string;
}) {
  const dispatch = useAppDispatch();
  const [selectedId, setSelectedId] = useState(variants[0]?.id ?? 0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [showSticky, setShowSticky] = useState(false);

  const selected =
    variants.find((v) => v.id === selectedId) ?? variants[0] ?? null;

  useEffect(() => {
    track("product_viewed", { slug: productSlug, name: productName });
  }, [productSlug, productName]);

  /** Reveal the sticky bar once the inline buy box has scrolled away. */
  const watchFold = useCallback((el: HTMLDivElement | null) => {
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowSticky(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function selectVariant(variant: PurchaseVariant) {
    setSelectedId(variant.id);
    setAdded(false);
    track("variant_selected", { sku: variant.sku, slug: productSlug });
  }

  function addToCart() {
    if (!selected || selected.stockQty <= 0) return;
    const item: CartItem = {
      variantId: selected.id,
      sku: selected.sku,
      productSlug,
      productName,
      packLabel: selected.packSizeLabel,
      unitPricePaise: selected.pricePaise,
      mrpPaise: selected.mrpPaise,
      accent,
      qty,
    };
    dispatch(itemAdded(item));
    setAdded(true);
    track("add_to_cart", {
      sku: selected.sku,
      slug: productSlug,
      qty,
      value: (selected.pricePaise * qty) / 100,
    });
  }

  if (!selected) return null;

  const outOfStock = selected.stockQty <= 0;
  // Only ever shown when literally true — never a fabricated urgency counter.
  const lowStock =
    !outOfStock && selected.stockQty <= selected.lowStockThreshold;
  const savingPaise = selected.mrpPaise - selected.pricePaise;

  return (
    <>
      <div ref={watchFold}>
        <fieldset>
          <legend className="eyebrow text-ek-green-700">Pack size</legend>
          <div className="mt-4 flex flex-wrap gap-3">
            {variants.map((variant) => {
              const isSelected = variant.id === selected.id;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => selectVariant(variant)}
                  aria-pressed={isSelected}
                  disabled={variant.stockQty <= 0}
                  className={`min-h-11 cursor-pointer rounded-sm border px-4 py-2.5 text-17 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    isSelected
                      ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                      : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
                  }`}
                >
                  {variant.packSizeLabel}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Fixed-height price block: swapping variants must not shift layout */}
        <div className="mt-7 flex min-h-[68px] flex-col justify-center">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-34 font-semibold text-ek-green-900 tabular-nums">
              {formatPaise(selected.pricePaise)}
            </span>
            {savingPaise > 0 && (
              <>
                <span className="text-17 text-ek-green-700 line-through tabular-nums">
                  {formatPaise(selected.mrpPaise)}
                </span>
                <span className="rounded-sm bg-ek-gold-100 px-2 py-0.5 text-15 text-ek-green-900">
                  Save {formatPaise(savingPaise)}
                </span>
              </>
            )}
          </div>
          <p className="mt-1.5 text-15 text-ek-green-700">
            SKU {selected.sku} · {selected.packSizeGrams} g · inclusive of all
            taxes
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <div className="flex items-center border border-ek-green-200">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="min-h-11 min-w-11 cursor-pointer text-20 text-ek-green-900 disabled:opacity-40"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span
              className="min-w-10 text-center text-17 tabular-nums"
              aria-live="polite"
            >
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(10, q + 1))}
              disabled={qty >= 10}
              className="min-h-11 min-w-11 cursor-pointer text-20 text-ek-green-900 disabled:opacity-40"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          <Button size="lg" onClick={addToCart} disabled={outOfStock}>
            {outOfStock ? "Out of stock" : "Add to cart"}
          </Button>

          <WishlistButton
            slug={productSlug}
            productName={productName}
            variant="inline"
          />
        </div>

        <div className="mt-4 min-h-6 text-15" aria-live="polite">
          {added && (
            <p className="text-ek-green-700">
              Added to cart.{" "}
              <Link href="/cart" className="link-draw text-ek-gold-800">
                View cart
              </Link>
            </p>
          )}
          {!added && lowStock && (
            <p className="text-ek-terracotta">
              Only {selected.stockQty} left in this pack size.
            </p>
          )}
        </div>

        {/* Keyed to the variant so switching packs resets a submitted form:
            "we will tell you about the 250 g" must not survive a click onto
            the 100 g. */}
        {outOfStock && (
          <BackInStockForm
            key={selected.id}
            variantId={selected.id}
            packLabel={selected.packSizeLabel}
            turnstileSiteKey={turnstileSiteKey}
          />
        )}

        <PincodeCheck className="mt-8 border-t border-ek-green-200 pt-7" />
      </div>

      {/* Mobile sticky bar — fixed, so it never causes layout shift */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-ek-green-200 bg-ek-paper/98 backdrop-blur-[2px] transition-transform duration-300 md:hidden ${
          showSticky ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!showSticky}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="min-w-0">
            <p className="truncate text-15 text-ek-green-700">
              {selected.packSizeLabel}
            </p>
            <p className="text-20 font-semibold text-ek-green-900 tabular-nums">
              {formatPaise(selected.pricePaise)}
            </p>
          </div>
          <Button
            onClick={addToCart}
            disabled={outOfStock}
            tabIndex={showSticky ? 0 : -1}
          >
            {outOfStock ? "Out of stock" : "Add to cart"}
          </Button>
        </div>
      </div>
    </>
  );
}
