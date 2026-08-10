"use client";

import Link from "next/link";
import { CouponField } from "./CouponField";
import { quoteBenefit, useCouponQuote } from "./useCouponQuote";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  itemRemoved,
  qtySet,
  selectCartHydrated,
  selectCartItems,
  selectCartSubtotalPaise,
  selectCouponCode,
} from "@/store/cart-slice";
import { ButtonLink } from "@/components/ui/Button";
import { PincodeCheck } from "@/components/shipping/PincodeCheck";
import { SoilLine } from "@/components/ui/SoilLine";
import { formatPaise } from "@/lib/money";
import {
  FREE_SHIPPING_THRESHOLD_PAISE,
  FLAT_SHIPPING_PAISE,
} from "@/lib/constants";
import { track } from "@/lib/analytics";

export function CartView() {
  const dispatch = useAppDispatch();
  const hydrated = useAppSelector(selectCartHydrated);
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartSubtotalPaise);
  const couponCode = useAppSelector(selectCouponCode);

  // Hooks run before the early returns below, which is why this one is
  // here rather than beside the totals it feeds.
  const { quote } = useCouponQuote(couponCode, items);

  // Server HTML and first client paint both render this skeleton, so the
  // persisted cart can never cause a hydration mismatch.
  if (!hydrated) {
    return (
      <div className="min-h-[40vh]" aria-busy="true" aria-live="polite">
        <p className="text-17 text-ek-green-700">Loading your cart…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[40vh]">
        <p className="max-w-[46ch] text-20 text-ek-green-700">
          Your cart is empty. The five origins are one click away.
        </p>
        <ButtonLink href="/products" size="lg" className="mt-8">
          Browse the shop
        </ButtonLink>
      </div>
    );
  }

  // The threshold is judged on the basket, before any coupon — the same
  // rule the server applies in shippingFor(), and the reason a voucher
  // never takes away free delivery someone has already earned.
  const shippingBeforeCoupon =
    subtotal >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : FLAT_SHIPPING_PAISE;
  const remainingForFree = FREE_SHIPPING_THRESHOLD_PAISE - subtotal;

  const { discountPaise: discount, shippingWaivedPaise } = quoteBenefit(quote);
  const shipping = shippingBeforeCoupon - shippingWaivedPaise;
  const total = subtotal - discount + shipping;

  return (
    <div className="grid gap-12 lg:grid-cols-[1.4fr_0.6fr] lg:gap-16">
      <ul className="border-t border-ek-green-200">
        {items.map((item) => (
          <li
            key={item.variantId}
            className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-4 border-b border-ek-green-200 py-6 sm:grid-cols-[1fr_auto_auto] sm:items-center"
          >
            <div className="min-w-0">
              <Link
                href={`/products/${item.productSlug}`}
                className="link-draw font-display text-20 text-ek-green-900"
              >
                {item.productName}
              </Link>
              <p className="mt-1 text-15 text-ek-green-700">
                {item.packLabel} · {formatPaise(item.unitPricePaise)} each
              </p>
              <button
                type="button"
                onClick={() => dispatch(itemRemoved(item.variantId))}
                className="mt-2 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4 hover:text-ek-terracotta"
              >
                Remove
              </button>
            </div>

            <div className="flex items-center border border-ek-green-200 justify-self-start">
              <button
                type="button"
                onClick={() =>
                  dispatch(
                    qtySet({ variantId: item.variantId, qty: item.qty - 1 }),
                  )
                }
                className="min-h-11 min-w-11 cursor-pointer text-20 text-ek-green-900"
                aria-label={`Decrease quantity of ${item.productName}`}
              >
                −
              </button>
              <span className="min-w-8 text-center text-17 tabular-nums">
                {item.qty}
              </span>
              <button
                type="button"
                onClick={() =>
                  dispatch(
                    qtySet({ variantId: item.variantId, qty: item.qty + 1 }),
                  )
                }
                disabled={item.qty >= 10}
                className="min-h-11 min-w-11 cursor-pointer text-20 text-ek-green-900 disabled:opacity-40"
                aria-label={`Increase quantity of ${item.productName}`}
              >
                +
              </button>
            </div>

            <p className="text-17 font-semibold text-ek-green-900 tabular-nums sm:min-w-24 sm:text-right">
              {formatPaise(item.unitPricePaise * item.qty)}
            </p>
          </li>
        ))}
      </ul>

      <aside aria-labelledby="summary-heading" className="lg:pt-2">
        <h2
          id="summary-heading"
          className="eyebrow text-ek-green-700"
        >
          Order summary
        </h2>
        <SoilLine align="left" className="mt-5 max-w-[12rem]" />

        <dl className="mt-6 space-y-3 text-17">
          <div className="flex justify-between gap-4">
            <dt className="text-ek-green-700">Subtotal</dt>
            <dd className="tabular-nums text-ek-green-900">
              {formatPaise(subtotal)}
            </dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-ek-green-700">Discount</dt>
              <dd className="tabular-nums text-ek-green-900">
                −{formatPaise(discount)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-ek-green-700">Shipping</dt>
            <dd className="tabular-nums text-ek-green-900">
              {shipping === 0 ? "Free" : formatPaise(shipping)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-ek-green-200 pt-3 text-20 font-semibold">
            <dt className="text-ek-green-900">Total</dt>
            <dd className="tabular-nums text-ek-green-900">
              {formatPaise(total)}
            </dd>
          </div>
        </dl>

        <CouponField />

        {remainingForFree > 0 && (
          <p className="mt-4 bg-ek-gold-100 px-4 py-3 text-15 text-ek-green-900">
            Add {formatPaise(remainingForFree)} more for free shipping.
          </p>
        )}

        <ButtonLink
          href="/checkout"
          size="lg"
          className="mt-7 w-full"
          onClick={() =>
            track("begin_checkout", {
              value: total / 100,
              items: items.length,
            })
          }
        >
          Checkout
        </ButtonLink>

        <p className="mt-4 text-15 text-ek-green-700">
          Cash on Delivery available across India. Taxes included.
        </p>

        {/* Reads the PIN code already entered on a product page, so most
            people see the answer here without typing anything. */}
        <PincodeCheck className="mt-8 border-t border-ek-green-200 pt-7" />
      </aside>
    </div>
  );
}
