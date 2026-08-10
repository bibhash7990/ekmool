/**
 * Coupon arithmetic. Pure — no database, no clock, no environment — so the
 * numbers can be reasoned about and tested on their own.
 *
 * Two rules hold everything together:
 *
 *  1. **A discount comes off before the tax is worked out.** Prices here
 *     are GST-inclusive, and s.15(3)(a) of the CGST Act excludes a discount
 *     given at the time of supply and recorded in the invoice from the
 *     transaction value. Taxing the undiscounted line would over-declare
 *     output tax on every order that used a voucher.
 *  2. **The parts sum to the whole, exactly.** The per-line shares add up
 *     to the order discount to the paise, so `subtotal - discount +
 *     shipping` is the total and the invoice reconciles. That is why the
 *     allocation below is largest-remainder rather than a round per line.
 */

export type CouponKind = "percent" | "flat" | "free_shipping";

export interface Coupon {
  id: number;
  code: string;
  description: string;
  kind: CouponKind;
  percentBps: number | null;
  amountPaise: number | null;
  maxDiscountPaise: number | null;
  minSubtotalPaise: number;
  startsAt: Date | null;
  endsAt: Date | null;
  globalLimit: number | null;
  perCustomerLimit: number;
  timesUsed: number;
  isActive: boolean;
}

export type CouponRefusal =
  | "unknown"
  | "inactive"
  | "not_started"
  | "expired"
  | "below_minimum"
  | "exhausted"
  | "already_used"
  | "no_benefit";

export interface CouponBenefit {
  /** Money off the goods. This is what moves the taxable value. */
  goodsDiscountPaise: number;
  /** Shipping waived. Charged at zero rather than discounted. */
  shippingWaivedPaise: number;
  /** What the customer is better off by, in total. For reporting. */
  benefitPaise: number;
}

/**
 * What a coupon is worth against a given basket.
 *
 * `shippingPaise` is the shipping that *would* be charged without the
 * coupon — computed from the pre-discount subtotal. Applying the
 * free-shipping threshold to the discounted subtotal instead would mean a
 * voucher could take away free delivery someone had already earned by what
 * they put in the basket, which reads as a penalty for using it.
 */
export function couponBenefit(
  coupon: Coupon,
  subtotalPaise: number,
  shippingPaise: number,
): CouponBenefit {
  if (coupon.kind === "free_shipping") {
    return {
      goodsDiscountPaise: 0,
      shippingWaivedPaise: shippingPaise,
      benefitPaise: shippingPaise,
    };
  }

  let discount =
    coupon.kind === "percent"
      ? Math.floor((subtotalPaise * (coupon.percentBps ?? 0)) / 10_000)
      : (coupon.amountPaise ?? 0);

  if (coupon.maxDiscountPaise !== null) {
    discount = Math.min(discount, coupon.maxDiscountPaise);
  }

  // Never more than the goods are worth. A flat ₹500 coupon on a ₹300
  // basket is ₹300 off, not a refund of ₹200 and a free parcel.
  discount = Math.max(0, Math.min(discount, subtotalPaise));

  return {
    goodsDiscountPaise: discount,
    shippingWaivedPaise: 0,
    benefitPaise: discount,
  };
}

/**
 * Splits `discountPaise` across lines in proportion to their totals, so the
 * shares sum to the discount exactly.
 *
 * Largest remainder: floor every share, then hand the leftover paise, one
 * at a time, to the lines with the largest discarded fraction. Rounding
 * each share independently would leave the sum a paise or two adrift from
 * the discount actually granted, and that difference lands on the invoice
 * as a total that does not add up.
 */
export function allocateDiscount(
  lineTotalsPaise: number[],
  discountPaise: number,
): number[] {
  const shares = lineTotalsPaise.map(() => 0);
  if (discountPaise <= 0) return shares;

  const subtotal = lineTotalsPaise.reduce((sum, value) => sum + value, 0);
  if (subtotal <= 0) return shares;

  const capped = Math.min(discountPaise, subtotal);

  const remainders: { index: number; fraction: number }[] = [];
  let allocated = 0;

  for (const [index, lineTotal] of lineTotalsPaise.entries()) {
    const exact = (lineTotal * capped) / subtotal;
    const whole = Math.floor(exact);
    shares[index] = whole;
    allocated += whole;
    remainders.push({ index, fraction: exact - whole });
  }

  // Ties broken by line order, which is deterministic — the same basket
  // must always produce the same invoice.
  remainders.sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  let leftover = capped - allocated;
  for (const { index } of remainders) {
    if (leftover <= 0) break;
    // A line cannot be discounted below zero, which matters when one line
    // is a rounding sliver next to a large one.
    if (shares[index] < lineTotalsPaise[index]) {
      shares[index] += 1;
      leftover -= 1;
    }
  }

  return shares;
}

/** What to tell the customer. Never "invalid" on its own — say which rule. */
export function couponRefusalMessage(
  reason: CouponRefusal,
  context: { minSubtotalPaise?: number } = {},
): string {
  switch (reason) {
    case "unknown":
    case "inactive":
      // One message for both, on purpose: a distinct "this code exists but
      // is switched off" tells someone probing for codes that they guessed
      // a real one.
      return "That code is not valid.";
    case "not_started":
      return "That code is not active yet.";
    case "expired":
      return "That code has expired.";
    case "below_minimum":
      return context.minSubtotalPaise
        ? `That code needs a basket of at least ₹${Math.floor(context.minSubtotalPaise / 100)}.`
        : "Your basket is below the minimum for that code.";
    case "exhausted":
      return "That code has been fully claimed.";
    case "already_used":
      return "You have already used that code.";
    case "no_benefit":
      return "That code would take nothing off this order.";
  }
}
