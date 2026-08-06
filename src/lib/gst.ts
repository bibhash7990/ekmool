/**
 * Indian GST arithmetic.
 *
 * Two rules govern everything here:
 *
 *  1. **Prices are GST-inclusive.** /terms says so. Tax is therefore
 *     extracted from the price, never added to it.
 *  2. **Nothing must fail to reconcile.** The tax on a line is the
 *     *remainder* after the taxable value, and the CGST half is the
 *     *remainder* after the SGST half, so `taxable + tax` is always exactly
 *     the price charged and `cgst + sgst` is always exactly the tax. Round
 *     both independently and you get invoices that are off by a paise,
 *     which is the kind of thing an accountant finds and you do not.
 *
 * No money is a float anywhere in this file. Rates are basis points.
 *
 * This is arithmetic, not tax advice. Which rate and which HSN code apply
 * to a given product is a question for a chartered accountant.
 */

export interface TaxLine {
  /** What the customer pays for this line, GST included. */
  inclusivePaise: number;
  rateBps: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

/** Same state as the seller → CGST + SGST. Different → IGST. */
export type SupplyKind = "intra" | "inter" | "unknown";

/**
 * Two states are the same for GST purposes when their names match. We
 * store both from the same canonical list (INDIAN_STATE_OPTIONS for the
 * buyer, SELLER_STATE for us), so a plain comparison is enough — but
 * normalise anyway, because SELLER_STATE is typed by a human into a .env.
 */
export function supplyKind(
  sellerState: string | null | undefined,
  placeOfSupply: string | null | undefined,
): SupplyKind {
  const seller = (sellerState ?? "").trim().toLowerCase();
  const buyer = (placeOfSupply ?? "").trim().toLowerCase();
  if (!seller || !buyer) return "unknown";
  return seller === buyer ? "intra" : "inter";
}

/**
 * Splits a GST-inclusive amount into its taxable value and tax.
 *
 * `kind: "unknown"` means the shop has no configured GST registration, and
 * it produces a line with **no tax at all** — taxable value equal to the
 * whole amount.
 *
 * That is the substantive rule, not a fallback. Section 32 of the CGST Act
 * forbids an unregistered person from collecting tax, so an unregistered
 * shop's orders carry none; and a line holding a taxable value with the tax
 * unaccounted for is a row that does not reconcile, which is precisely the
 * defect an accountant finds. Once the registration is configured every
 * subsequent order records its split; earlier orders stay honestly untaxed,
 * which is what they were.
 */
export function taxFromInclusive(
  inclusivePaise: number,
  rateBps: number,
  kind: SupplyKind,
): TaxLine {
  if (inclusivePaise <= 0 || rateBps <= 0 || kind === "unknown") {
    return {
      inclusivePaise,
      // Zero, not the rate that was asked for. What comes back is the rate
      // actually *applied*, and nothing was applied here. Passing the
      // catalogue's 5% back out would snapshot a line onto the order reading
      // "5% GST" beside a tax figure of nothing — a contradiction on the
      // record, and one the invoice would then try to print.
      rateBps: 0,
      taxablePaise: inclusivePaise,
      taxPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
    };
  }

  // Integer arithmetic throughout: taxable = inclusive * 10000 / (10000 + bps).
  const taxablePaise = Math.round(
    (inclusivePaise * 10_000) / (10_000 + rateBps),
  );
  const taxPaise = inclusivePaise - taxablePaise;

  if (kind === "intra") {
    // The odd paise goes to CGST. Arbitrary but consistent, and the two
    // halves always add back to taxPaise.
    const sgstPaise = Math.floor(taxPaise / 2);
    return {
      inclusivePaise,
      rateBps,
      taxablePaise,
      taxPaise,
      cgstPaise: taxPaise - sgstPaise,
      sgstPaise,
      igstPaise: 0,
    };
  }

  return {
    inclusivePaise,
    rateBps,
    taxablePaise,
    taxPaise,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: taxPaise,
  };
}

/**
 * The rate that applies to delivery.
 *
 * Delivery here is not a separate service the customer could decline — it
 * is part of getting the goods to them, which makes it a composite supply
 * taxed at the rate of the principal supply. With one rate across the
 * catalogue this is academic; the highest rate present is the defensible
 * answer when that stops being true, so it is written that way now.
 */
export function shippingRateBps(itemRatesBps: number[]): number {
  return itemRatesBps.length === 0 ? 0 : Math.max(...itemRatesBps);
}

/**
 * The Indian financial year containing a date: 1 April to 31 March.
 * April 2026 through March 2027 is "2026-27".
 */
export function financialYear(date: Date): string {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** `EK/2026-27/000123` — series, year, zero-padded sequence. */
export function formatInvoiceNumber(fy: string, sequence: number): string {
  return `EK/${fy}/${String(sequence).padStart(6, "0")}`;
}

/** 5% ← 500. Two decimals only when the rate actually has them. */
export function formatRateBps(rateBps: number): string {
  const percent = rateBps / 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

/**
 * The GST slabs that exist in India, as percentages.
 *
 * A closed list rather than a number field. The rate is not the owner's
 * opinion — it is 0, 5, 12, 18 or 28 — and a typo'd 50 would be collected
 * from customers, printed on invoices and owed to nobody. The admin form
 * offers these and the server refuses anything else.
 */
export const GST_RATE_OPTIONS = [0, 5, 12, 18, 28] as const;
