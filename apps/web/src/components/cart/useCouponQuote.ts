"use client";

import { useEffect, useState } from "react";
import type { CartItem } from "@/store/cart-slice";

/**
 * What the applied code is currently worth, re-asked whenever the basket
 * changes. Used by the cart and by the checkout summary, so the two can
 * never show different totals for the same order.
 *
 * A quote, not a reservation. Checkout re-runs every rule against a locked
 * coupon row and is the only authority; this exists so the customer is not
 * asked to commit to a number nobody has shown them.
 *
 * The answer is stored **against the question it answers** rather than on
 * its own. That does three things at once: removing the code clears the
 * quote without an effect that sets state (which cascades renders, and
 * which React's lint rule objects to), a quote for the previous basket is
 * never shown beside the current one, and `busy` becomes something derived
 * rather than a second flag that can disagree with the first.
 */

export interface CouponQuote {
  ok: boolean;
  description?: string;
  goodsDiscountPaise: number;
  shippingWaivedPaise: number;
  message?: string;
}

export interface CouponQuoteState {
  quote: CouponQuote | null;
  busy: boolean;
}

export function useCouponQuote(
  code: string | null,
  items: CartItem[],
): CouponQuoteState {
  const [settled, setSettled] = useState<{
    key: string;
    quote: CouponQuote | null;
  } | null>(null);

  // A stable description of the basket. Depending on the array itself would
  // re-fire on every render; depending on its contents fires when the
  // contents change, which is when a minimum can stop being met.
  const basket = items.map((i) => `${i.variantId}x${i.qty}`).join(",");
  const key = `${code ?? ""}|${basket}`;
  const asked = Boolean(code) && items.length > 0;

  useEffect(() => {
    if (!asked) return;

    let cancelled = false;
    const payload = basket.split(",").map((entry) => {
      const [variantId, qty] = entry.split("x");
      return { variantId: Number(variantId), qty: Number(qty) };
    });

    fetch("/api/coupons/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, items: payload }),
    })
      .then((response) => response.json())
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        setSettled({
          key,
          quote:
            data.code === "COUPON_OK"
              ? {
                  ok: true,
                  description: String(data.description ?? ""),
                  goodsDiscountPaise: Number(data.goodsDiscountPaise ?? 0),
                  shippingWaivedPaise: Number(data.shippingWaivedPaise ?? 0),
                }
              : {
                  ok: false,
                  goodsDiscountPaise: 0,
                  shippingWaivedPaise: 0,
                  message: String(data.error ?? "That code is not valid."),
                },
        });
      })
      .catch(() => {
        // Offline, or the database is down. The code stays applied — it may
        // well be fine — and checkout decides regardless. Settling on null
        // stops the spinner without inventing a discount of zero, which
        // would be a guess presented as a fact.
        if (!cancelled) setSettled({ key, quote: null });
      });

    return () => {
      cancelled = true;
    };
  }, [asked, key, code, basket]);

  const current = settled?.key === key ? settled.quote : null;

  return { quote: current, busy: asked && settled?.key !== key };
}

/** The discount and shipping waiver a quote actually grants. */
export function quoteBenefit(quote: CouponQuote | null): {
  discountPaise: number;
  shippingWaivedPaise: number;
} {
  if (!quote?.ok) return { discountPaise: 0, shippingWaivedPaise: 0 };
  return {
    discountPaise: quote.goodsDiscountPaise,
    shippingWaivedPaise: quote.shippingWaivedPaise,
  };
}
