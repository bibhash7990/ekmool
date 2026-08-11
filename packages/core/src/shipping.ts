/**
 * Delivery charges, and the cart arithmetic built on them.
 *
 * These two numbers lived in `apps/web/src/lib/constants.ts` until the phone
 * needed them. Copying ₹499 and ₹49 into a second client would have been the
 * quickest thing to do and the exact failure this package exists to prevent:
 * a promotion changes the threshold, one client is redeployed, and for a
 * while the app and the site quote different delivery charges for the same
 * basket. The customer sees a lie somewhere and cannot tell which side.
 *
 * **Nothing here is authoritative.** The checkout transaction recomputes
 * every figure from rows it holds a lock on, and `docs/SECURITY.md` is blunt
 * about why: never trust a client-sent price, discount or total. What this
 * module produces is the number a customer is *shown while deciding* — which
 * has to be right, because a total that changes at the last step is the
 * fastest way to lose an order, but which is never the number that gets
 * charged.
 */

/** Baskets at or above this get free delivery. Integer paise, always. */
export const FREE_SHIPPING_THRESHOLD_PAISE = 49_900;

/** Otherwise this, flat, anywhere in India. */
export const FLAT_SHIPPING_PAISE = 4_900;

/**
 * The delivery charge for a basket, **judged before any coupon**.
 *
 * The ordering is the rule, not an implementation detail. A ₹520 basket has
 * earned free delivery; applying a ₹50 discount first would drop it to ₹470
 * and take that back, so a voucher would silently cost the customer ₹49 of
 * the ₹50 it promised to save. The server does it in this order in
 * `shippingFor`, and both clients have to agree with the server or the total
 * on screen is wrong before checkout ever runs.
 */
export function shippingFor(subtotalPaise: number): number {
  return subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE
    ? 0
    : FLAT_SHIPPING_PAISE;
}

/**
 * What a coupon is doing to a basket. Both fields come from the server's
 * quote — the client never computes a discount, it only places one.
 */
export interface CartAdjustments {
  /** Discount against goods, in paise. */
  discountPaise?: number;
  /** Delivery waived by a free-shipping coupon, in paise. */
  shippingWaivedPaise?: number;
}

export interface CartTotals {
  subtotalPaise: number;
  discountPaise: number;
  /** After any waiver, floored at zero. */
  shippingPaise: number;
  totalPaise: number;
  /**
   * How much more is needed for free delivery, or 0 once it is earned.
   * Never negative — "spend −₹21 more" has shipped in real storefronts.
   */
  remainingForFreePaise: number;
}

/**
 * Every number the cart and checkout screens display, computed once.
 *
 * Returned as a whole rather than as four separate helpers because the
 * figures are only consistent together: shipping depends on the pre-coupon
 * subtotal, the total depends on the waived shipping, and a screen that
 * called two of these and hand-rolled the third is how the two clients would
 * drift apart again.
 */
export function cartTotals(
  subtotalPaise: number,
  adjustments: CartAdjustments = {},
): CartTotals {
  const discountPaise = adjustments.discountPaise ?? 0;
  const shippingWaivedPaise = adjustments.shippingWaivedPaise ?? 0;

  // Clamped rather than trusted. A waiver larger than the charge would make
  // shipping negative and quietly pay the customer to receive a parcel.
  const shippingPaise = Math.max(
    0,
    shippingFor(subtotalPaise) - shippingWaivedPaise,
  );

  return {
    subtotalPaise,
    discountPaise,
    shippingPaise,
    totalPaise: Math.max(0, subtotalPaise - discountPaise + shippingPaise),
    remainingForFreePaise: Math.max(
      0,
      FREE_SHIPPING_THRESHOLD_PAISE - subtotalPaise,
    ),
  };
}
