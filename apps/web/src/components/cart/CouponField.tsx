"use client";

import { useId, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  couponApplied,
  couponCleared,
  selectCartItems,
  selectCouponCode,
} from "@/store/cart-slice";
import { useCouponQuote } from "./useCouponQuote";
import { formatPaise } from "@/lib/money";

/**
 * The promotion code box.
 *
 * What it shows is a quote, and the copy says so. Checkout re-runs every
 * rule against a locked coupon row, so a code that reads as valid here can
 * still be refused there — claimed by someone else in between, expired on
 * the stroke, or applied to a basket that has since changed. The
 * alternative, holding a use while somebody browses, would let a handful of
 * abandoned carts exhaust a promotion.
 */
export function CouponField() {
  const inputId = useId();
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectCartItems);
  const code = useAppSelector(selectCouponCode);
  const { quote, busy } = useCouponQuote(code, items);

  const [draft, setDraft] = useState("");

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const next = draft.trim().toUpperCase();
    if (next.length < 3) return;
    dispatch(couponApplied(next));
    setDraft("");
  }

  if (code) {
    return (
      <div className="mt-6 border-t border-ek-green-200 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-15 text-ek-green-900">
            <span className="font-medium tracking-[0.06em]">{code}</span>
            {busy && <span className="text-ek-green-700"> · checking…</span>}
          </p>
          <button
            type="button"
            onClick={() => dispatch(couponCleared())}
            className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4 hover:text-ek-gold-800"
          >
            Remove
          </button>
        </div>

        <div className="mt-1 min-h-6 text-15" aria-live="polite">
          {quote?.ok && (
            <p className="text-ek-green-700">
              {quote.description}
              {quote.shippingWaivedPaise > 0 &&
                ` — delivery on us (${formatPaise(quote.shippingWaivedPaise)})`}
            </p>
          )}
          {quote && !quote.ok && (
            <p className="text-ek-terracotta">{quote.message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={apply} className="mt-6 border-t border-ek-green-200 pt-5">
      <label htmlFor={inputId} className="eyebrow block text-ek-green-700">
        Promotion code
      </label>
      <div className="mt-2.5 flex gap-2">
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
          }
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Enter code"
          className="min-h-11 min-w-0 flex-1 border border-ek-green-200 bg-ek-paper px-3 text-17 tracking-[0.06em] text-ek-green-900 outline-none focus:border-ek-green-700"
        />
        <button
          type="submit"
          disabled={draft.trim().length < 3}
          className="min-h-11 shrink-0 cursor-pointer border border-ek-green-900 px-5 text-17 text-ek-green-900 transition-colors hover:bg-ek-green-900 hover:text-ek-cream disabled:cursor-not-allowed disabled:opacity-45"
        >
          Apply
        </button>
      </div>
    </form>
  );
}
