/**
 * The arithmetic, asserted on its own.
 *
 *   pnpm --filter @ekmool/core test
 *
 * No server, no database, no network — which is the whole point. Until this
 * file existed there was no way to check what `splitGst` does to a hundred
 * rupees without booting Next and MySQL, so the tax split was only ever
 * exercised through `test:commerce` and `test:promotions`, both of which need
 * a running stack and neither of which can be run on a laptop with Docker
 * closed. These are the same numbers, checked directly, in about a second.
 *
 * This is additional coverage, not a replacement: the end-to-end suites test
 * that the application *uses* the arithmetic correctly, and that is a
 * different claim from the arithmetic being correct.
 *
 * Modules are imported by relative path with their real `.ts` extension, so
 * nothing has to be installed, linked or resolved through the package's
 * exports map for this to run. Node 22 strips the types itself.
 */
import {
  GST_RATE_OPTIONS,
  financialYear,
  formatInvoiceNumber,
  formatRateBps,
  shippingRateBps,
  supplyKind,
  taxFromInclusive,
} from "../src/gst.ts";
import {
  allocateDiscount,
  couponBenefit,
  couponRefusalMessage,
} from "../src/coupons.ts";
import { formatPaise, paiseToRupees } from "../src/money.ts";
import {
  DELIVERY_ZONES,
  DISPATCH_DAYS,
  checkPincode,
} from "../src/serviceability.ts";
import {
  FLAT_SHIPPING_PAISE,
  FREE_SHIPPING_THRESHOLD_PAISE,
  cartTotals,
  shippingFor,
} from "../src/shipping.ts";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Assert on the value, never on truthiness — and print both sides on a miss. */
function equals(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, a === e ? "" : `got ${a}, expected ${e}`);
}

/* ------------------------------------------------------------------ */
console.log("\nGST — the inclusive split");

equals(
  "5% on ₹100 inclusive leaves ₹95.24 taxable and ₹4.76 tax",
  taxFromInclusive(10_000, 500, "intra"),
  {
    inclusivePaise: 10_000,
    rateBps: 500,
    taxablePaise: 9524,
    taxPaise: 476,
    cgstPaise: 238,
    sgstPaise: 238,
    igstPaise: 0,
  },
);

equals(
  "an odd paise of tax goes to CGST, not SGST (18% on ₹10 is 153p: 77 + 76)",
  taxFromInclusive(1000, 1800, "intra"),
  {
    inclusivePaise: 1000,
    rateBps: 1800,
    taxablePaise: 847,
    taxPaise: 153,
    cgstPaise: 77,
    sgstPaise: 76,
    igstPaise: 0,
  },
);

equals(
  "an inter-state supply puts the whole tax in IGST and nothing in CGST/SGST",
  taxFromInclusive(10_000, 500, "inter"),
  {
    inclusivePaise: 10_000,
    rateBps: 500,
    taxablePaise: 9524,
    taxPaise: 476,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 476,
  },
);

equals(
  "an unregistered shop reports rateBps 0, not the rate it was asked for",
  taxFromInclusive(10_000, 500, "unknown"),
  {
    inclusivePaise: 10_000,
    rateBps: 0,
    taxablePaise: 10_000,
    taxPaise: 0,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
  },
);

equals(
  "a zero-rated line is untaxed and keeps its whole value taxable",
  taxFromInclusive(10_000, 0, "intra"),
  {
    inclusivePaise: 10_000,
    rateBps: 0,
    taxablePaise: 10_000,
    taxPaise: 0,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
  },
);

// The reconciliation rule, brute-forced. A per-part `Math.round` passes the
// spot checks above and fails here, which is exactly the bug the module's
// header says it exists to prevent.
{
  let taxableMismatch = null;
  let halvesMismatch = null;
  for (let paise = 1; paise <= 5000 && !taxableMismatch && !halvesMismatch; paise += 1) {
    for (const rateBps of [500, 1200, 1800, 2800]) {
      const line = taxFromInclusive(paise, rateBps, "intra");
      if (line.taxablePaise + line.taxPaise !== paise) {
        taxableMismatch = `${paise}p at ${rateBps}bps`;
        break;
      }
      if (line.cgstPaise + line.sgstPaise !== line.taxPaise) {
        halvesMismatch = `${paise}p at ${rateBps}bps`;
        break;
      }
    }
  }
  check(
    "taxable + tax equals the price charged for every amount 1p–₹50 at 4 rates",
    taxableMismatch === null,
    taxableMismatch ? `first mismatch at ${taxableMismatch}` : "",
  );
  check(
    "CGST + SGST equals the tax for every amount 1p–₹50 at 4 rates",
    halvesMismatch === null,
    halvesMismatch ? `first mismatch at ${halvesMismatch}` : "",
  );
}

equals(
  "same state is an intra-state supply even when one side is untrimmed",
  supplyKind("Karnataka", "  karnataka "),
  "intra",
);
equals(
  "different states are an inter-state supply",
  supplyKind("Karnataka", "Kerala"),
  "inter",
);
equals(
  "an unconfigured seller state makes the supply kind unknown",
  supplyKind("", "Kerala"),
  "unknown",
);

equals(
  "delivery is taxed at the highest rate in the basket",
  shippingRateBps([500, 1800, 0]),
  1800,
);
equals("an empty basket taxes delivery at nothing", shippingRateBps([]), 0);

equals(
  "1 April 2026 falls in financial year 2026-27",
  financialYear(new Date(2026, 3, 1)),
  "2026-27",
);
equals(
  "31 March 2026 is still in financial year 2025-26",
  financialYear(new Date(2026, 2, 31)),
  "2025-26",
);

equals(
  "invoice 123 of 2026-27 is EK/2026-27/000123",
  formatInvoiceNumber("2026-27", 123),
  "EK/2026-27/000123",
);

equals("500 basis points prints as 5%", formatRateBps(500), "5%");
equals(
  "250 basis points keeps its decimals rather than rounding to 3%",
  formatRateBps(250),
  "2.50%",
);

equals(
  "the rate options are the five slabs India actually has",
  [...GST_RATE_OPTIONS],
  [0, 5, 12, 18, 28],
);

/* ------------------------------------------------------------------ */
console.log("\nCoupons — what a code is worth");

const percent = {
  kind: "percent",
  percentBps: 1000,
  amountPaise: null,
  maxDiscountPaise: null,
};

equals(
  "10% off a ₹450 basket is ₹45",
  couponBenefit(percent, 45_000, 9900),
  { goodsDiscountPaise: 4500, shippingWaivedPaise: 0, benefitPaise: 4500 },
);

// 7% of 12 350p is exactly 864.5p. Chosen for the half: a `Math.round` here
// would hand the customer a paise that was not on the coupon, and every
// value whose fraction is below .5 passes either way.
equals(
  "a percentage discount floors rather than rounds (7% of ₹123.50 is 864p, not 865p)",
  couponBenefit(
    { ...percent, percentBps: 700 },
    12_350,
    0,
  ).goodsDiscountPaise,
  864,
);

equals(
  "the cap wins over the percentage: 25% of ₹1000 capped at ₹200 is ₹200",
  couponBenefit(
    { ...percent, percentBps: 2500, maxDiscountPaise: 20_000 },
    100_000,
    0,
  ).goodsDiscountPaise,
  20_000,
);

equals(
  "a ₹500 flat code on a ₹300 basket takes ₹300, not ₹500",
  couponBenefit(
    {
      kind: "flat",
      percentBps: null,
      amountPaise: 50_000,
      maxDiscountPaise: null,
    },
    30_000,
    9900,
  ),
  { goodsDiscountPaise: 30_000, shippingWaivedPaise: 0, benefitPaise: 30_000 },
);

equals(
  "free shipping waives the delivery charge and touches the goods not at all",
  couponBenefit(
    {
      kind: "free_shipping",
      percentBps: null,
      amountPaise: null,
      maxDiscountPaise: null,
    },
    45_000,
    9900,
  ),
  { goodsDiscountPaise: 0, shippingWaivedPaise: 9900, benefitPaise: 9900 },
);

equals(
  "free shipping on a basket already over the threshold is worth nothing",
  couponBenefit(
    {
      kind: "free_shipping",
      percentBps: null,
      amountPaise: null,
      maxDiscountPaise: null,
    },
    120_000,
    0,
  ).benefitPaise,
  0,
);

/* ---- the allocation ---- */

equals(
  "₹10 across lines of 100/50/33.33 is 545 + 273 + 182, summing exactly",
  allocateDiscount([10_000, 5000, 3333], 1000),
  [545, 273, 182],
);

equals(
  "a single leftover paise goes to the first line, so the same basket always invoices the same way",
  allocateDiscount([1000, 1000, 1000], 1),
  [1, 0, 0],
);

equals(
  "a discount larger than the basket is capped at the basket",
  allocateDiscount([100, 100], 500),
  [100, 100],
);

equals("no discount allocates nothing", allocateDiscount([100, 200], 0), [0, 0]);

equals(
  "a zero-value basket allocates nothing rather than dividing by zero",
  allocateDiscount([0, 0], 500),
  [0, 0],
);

// Largest-remainder's whole reason for existing: the shares must sum to the
// discount for every shape of basket, not just the tidy ones.
{
  let mismatch = null;
  const baskets = [
    [1, 1, 1],
    [99_999, 1],
    [3333, 3333, 3334],
    [12_500, 7999, 45, 60_000],
    [700, 700, 700, 700, 700, 700, 700],
  ];
  for (const basket of baskets) {
    const subtotal = basket.reduce((sum, v) => sum + v, 0);
    for (const discount of [1, 7, 999, Math.floor(subtotal / 3), subtotal]) {
      const shares = allocateDiscount(basket, discount);
      const total = shares.reduce((sum, v) => sum + v, 0);
      if (total !== Math.min(discount, subtotal)) {
        mismatch = `[${basket}] − ${discount} allocated ${total}`;
        break;
      }
      if (shares.some((share, i) => share > basket[i])) {
        mismatch = `[${basket}] − ${discount} discounted a line below zero`;
        break;
      }
    }
    if (mismatch) break;
  }
  check(
    "the line shares sum to the discount across 25 basket/discount pairs, and no line goes negative",
    mismatch === null,
    mismatch ?? "",
  );
}

/* ---- the refusals ---- */

equals(
  "a below-minimum refusal names the threshold in rupees",
  couponRefusalMessage("below_minimum", { minSubtotalPaise: 50_000 }),
  "That code needs a basket of at least ₹500.",
);
equals(
  "without a threshold it still says which rule refused, not 'invalid'",
  couponRefusalMessage("below_minimum"),
  "Your basket is below the minimum for that code.",
);
check(
  "a switched-off code is indistinguishable from a made-up one, so probing learns nothing",
  couponRefusalMessage("inactive") === couponRefusalMessage("unknown"),
  `${couponRefusalMessage("inactive")} / ${couponRefusalMessage("unknown")}`,
);
equals(
  "an expired code says so",
  couponRefusalMessage("expired"),
  "That code has expired.",
);

/* ------------------------------------------------------------------ */
console.log("\nMoney — display only");

equals("50 000 paise is ₹500 with no decimals", formatPaise(50_000), "₹500");
equals(
  "50 050 paise keeps both decimals rather than hiding 50p",
  formatPaise(50_050),
  "₹500.50",
);
equals("one paise is ₹0.01, not ₹0", formatPaise(1), "₹0.01");
equals("nothing is ₹0", formatPaise(0), "₹0");
equals(
  "grouping is Indian, not thousands: ₹1,23,456",
  formatPaise(12_345_600),
  "₹1,23,456",
);
equals("12 345 paise is 123.45 rupees", paiseToRupees(12_345), 123.45);
equals(
  "the admin form's conversion round-trips: ₹1234.56 → paise → rupees",
  paiseToRupees(Math.round(1234.56 * 100)),
  1234.56,
);

/* ------------------------------------------------------------------ */
console.log("\nServiceability — the delivery bands");

equals(
  "a Bengaluru PIN is metro: 1 day to dispatch plus 2–4 in transit",
  (({ code, circle, minDays, maxDays }) => ({ code, circle, minDays, maxDays }))(
    checkPincode("560001"),
  ),
  { code: "OK", circle: "Karnataka", minDays: 3, maxDays: 5 },
);

equals(
  "Thane (421) is standard, not metro — it is not on the short list",
  checkPincode("421001").zone.id,
  "standard",
);

equals(
  "249 takes the slower hill band even though it also covers Haridwar",
  checkPincode("249001").zone.id,
  "extended",
);

equals(
  "737 is Sikkim, not West Bengal, and is an extended-transit destination",
  (({ circle, minDays, maxDays }) => ({ circle, minDays, maxDays }))(
    checkPincode("737101"),
  ),
  { circle: "Sikkim", minDays: 7, maxDays: 11 },
);

equals(
  "68255x is Lakshadweep; 682xxx elsewhere is mainland Kerala",
  [checkPincode("682551").circle, checkPincode("682001").circle],
  ["Lakshadweep", "Kerala"],
);

equals(
  "744 is the Andamans and takes the extended band",
  checkPincode("744101").zone.id,
  "extended",
);

equals(
  "spaces in a typed PIN code do not stop it resolving",
  checkPincode(" 560 001").code,
  "OK",
);

equals(
  "a leading zero is reported as a typo, not as 'not serviceable'",
  checkPincode("012345").code,
  "UNASSIGNED",
);
equals(
  "a 9-series PIN is Army Postal, which is a real address we cannot courier to",
  checkPincode("912345").code,
  "ARMY_POSTAL",
);
equals(
  "65 was never allocated, so it falls through to unassigned",
  checkPincode("650001").code,
  "UNASSIGNED",
);
equals(
  "five digits is a format error",
  checkPincode("12345").code,
  "INVALID_FORMAT",
);
equals(
  "letters are a format error",
  checkPincode("56000A").code,
  "INVALID_FORMAT",
);

check(
  "a failed lookup carries no zone and no estimate to render",
  checkPincode("12345").zone === null &&
    checkPincode("12345").minDays === null &&
    checkPincode("12345").maxDays === null,
);

// /shipping-policy renders these same three rows. If the bands move, the
// published policy moves with them — this asserts the numbers the policy is
// currently making a promise about.
equals(
  "the published bands are 2-4, 4-7 and 6-10 working days in transit",
  Object.values(DELIVERY_ZONES).map((z) => [z.id, z.minDays, z.maxDays]),
  [
    ["metro", 2, 4],
    ["standard", 4, 7],
    ["extended", 6, 10],
  ],
);

check(
  "every quoted estimate is the transit band plus the dispatch day",
  ["560001", "421001", "737101"].every((pin) => {
    const result = checkPincode(pin);
    return (
      result.minDays === DISPATCH_DAYS + result.zone.minDays &&
      result.maxDays === DISPATCH_DAYS + result.zone.maxDays
    );
  }),
);

/* ------------------------------------------------------------------ */
console.log("\nShipping — the cart arithmetic both clients show");

equals(
  "a ₹200 basket pays flat ₹49 delivery",
  shippingFor(20_000),
  FLAT_SHIPPING_PAISE,
);
equals(
  "exactly ₹499 is free — the threshold is inclusive",
  shippingFor(FREE_SHIPPING_THRESHOLD_PAISE),
  0,
);
equals(
  "a paisa under the threshold still pays",
  shippingFor(FREE_SHIPPING_THRESHOLD_PAISE - 1),
  FLAT_SHIPPING_PAISE,
);

// The ordering rule, and the reason it is a rule. A ₹520 basket has earned
// free delivery; if a ₹50 discount were subtracted first the subtotal would
// fall to ₹470 and delivery would come back, so a voucher promising ₹50 off
// would hand back ₹49 of it. This assertion fails against that mistake,
// which is the only kind of assertion worth writing here.
equals(
  "a coupon cannot take back free delivery already earned",
  cartTotals(52_000, { discountPaise: 5_000 }),
  {
    subtotalPaise: 52_000,
    discountPaise: 5_000,
    shippingPaise: 0,
    totalPaise: 47_000,
    remainingForFreePaise: 0,
  },
);

equals(
  "a free-shipping coupon waives the charge on a small basket",
  cartTotals(20_000, { shippingWaivedPaise: FLAT_SHIPPING_PAISE }),
  {
    subtotalPaise: 20_000,
    discountPaise: 0,
    shippingPaise: 0,
    totalPaise: 20_000,
    remainingForFreePaise: 29_900,
  },
);

// Both floors, asserted rather than assumed. A waiver larger than the charge
// would otherwise make shipping negative and pay the customer to receive a
// parcel; a discount larger than the basket would produce a negative total.
equals(
  "an oversized waiver floors shipping at zero, never below",
  cartTotals(20_000, { shippingWaivedPaise: 99_999 }).shippingPaise,
  0,
);
equals(
  "a discount larger than the basket floors the total at zero",
  cartTotals(20_000, { discountPaise: 99_999 }).totalPaise,
  0,
);

equals(
  "an empty basket is told the full amount remaining for free delivery",
  cartTotals(0).remainingForFreePaise,
  FREE_SHIPPING_THRESHOLD_PAISE,
);
equals(
  "remaining is never negative once the threshold is passed",
  cartTotals(80_000).remainingForFreePaise,
  0,
);

/* ------------------------------------------------------------------ */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
}

process.exit(failures.length ? 1 : 0);
