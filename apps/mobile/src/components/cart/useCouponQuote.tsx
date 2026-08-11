import { useEffect, useState } from "react";

import type { CartItem } from "@ekmool/core/cart";

import { previewCoupon, type CouponQuote } from "@/api/coupons";

/**
 * What the applied code is currently worth, re-asked whenever the basket
 * changes.
 *
 * A port of `apps/web/src/components/cart/useCouponQuote.ts`, deliberately
 * kept the same shape rather than rewritten to taste — the two clients must
 * ask the same question at the same moments, or one of them will show a
 * discount the other does not.
 *
 * **Mounted by the basket screen and by checkout**, as on the web, and that
 * is what stops those two screens quoting different totals for one basket.
 * Checkout asked nothing for a while and showed the undiscounted total; the
 * customer saw ₹450 in the basket and ₹500 on the button. Whatever else
 * changes here, both screens have to keep going through this hook and through
 * `cartTotals` — a screen that works a discount out for itself is the same
 * bug written a second time.
 *
 * The answer is stored **against the question it answers** rather than on its
 * own, which does three things at once: removing the code clears the quote
 * without an effect that sets state, a quote for the previous basket is never
 * shown beside the current one, and `busy` is derived rather than a second
 * flag that can disagree with the first.
 *
 * There is no debounce. The basket changes on a deliberate tap of a stepper,
 * not on a keystroke, and the code is only quoted once it has been applied —
 * so the request rate is bounded by how fast somebody can press `+`, and a
 * delay would only make a stale figure sit on screen longer.
 *
 * This file is `.tsx` and exports no component. It stays in `components/cart/`
 * even though checkout imports it too, matching the web's folder exactly —
 * moving it somewhere neutral would be tidier and would break the one-to-one
 * correspondence that lets a reader diff the two clients' coupon handling
 * file by file.
 */

export interface CouponQuoteState {
  /** Null until the current question has an answer. */
  quote: CouponQuote | null;
  /** A request is in flight for the basket on screen right now. */
  busy: boolean;
}

export function useCouponQuote(
  code: string | null,
  items: readonly CartItem[],
): CouponQuoteState {
  const [settled, setSettled] = useState<{
    key: string;
    quote: CouponQuote | null;
  } | null>(null);

  // A stable description of the basket. Depending on the array itself would
  // re-fire on every render; depending on its contents fires when the
  // contents change, which is when a minimum can stop being met.
  const basket = items.map((item) => `${item.variantId}x${item.qty}`).join(",");
  const key = `${code ?? ""}|${basket}`;
  const asked = code !== null && items.length > 0;

  useEffect(() => {
    if (!asked || code === null) return;

    const controller = new AbortController();
    let cancelled = false;

    // Rebuilt from `basket` rather than read from `items`, so the effect
    // depends on the string and not on an array identity that changes every
    // render. The web does the same, for the same reason.
    const payload = basket.split(",").map((entry) => {
      const [variantId, qty] = entry.split("x");
      return { variantId: Number(variantId), qty: Number(qty) };
    });

    void (async () => {
      const quote = await previewCoupon(code, payload, {
        signal: controller.signal,
      });
      // The abort is checked rather than a `CANCELLED` status being modelled
      // in `CouponQuote`: a screen that unmounted, or a basket that changed
      // mid-flight, is this hook's business and not something a cart summary
      // should have a branch for.
      if (cancelled) return;
      setSettled({ key, quote });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [asked, key, code, basket]);

  const current = settled?.key === key ? settled.quote : null;

  return { quote: current, busy: asked && settled?.key !== key };
}

/**
 * The discount and the waiver a quote actually grants, in the shape
 * `cartTotals` takes.
 *
 * A refused code and an unchecked one both grant nothing, and they grant
 * nothing for different reasons — the distinction belongs in the sentence
 * under the field, not in the arithmetic. Everything downstream of here is
 * `@ekmool/core/shipping`.
 */
export function quoteAdjustments(quote: CouponQuote | null): {
  discountPaise: number;
  shippingWaivedPaise: number;
} {
  if (quote?.status !== "granted") {
    return { discountPaise: 0, shippingWaivedPaise: 0 };
  }
  return {
    discountPaise: quote.goodsDiscountPaise,
    shippingWaivedPaise: quote.shippingWaivedPaise,
  };
}
