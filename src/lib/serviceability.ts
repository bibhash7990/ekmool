/**
 * PIN code lookup: which postal circle, and how long delivery takes.
 *
 * The delivery bands in DELIVERY_ZONES are the single source of truth for
 * both this checker and the /shipping-policy page. That is the whole point
 * of the module — a checker that quotes "3-5 days" while the published
 * policy says "4 to 7" has turned the policy into a lie, and nobody would
 * notice until a customer quoted one back at us.
 *
 * Two rules govern the data below:
 *
 *  1. **Where a prefix straddles both terrain types, take the slower band.**
 *     PIN prefix 249 covers Haridwar in the plains and Uttarkashi in the
 *     hills. Quoting the hill figure means Haridwar sometimes arrives early;
 *     quoting the plains figure means Uttarkashi arrives late. An estimate
 *     that runs long is a pleasant surprise. One that runs short is a
 *     broken promise.
 *  2. **Nothing here claims a courier will or will not go somewhere.** We
 *     have no serviceability feed. What this returns is a circle name and a
 *     transit estimate; the shipping policy already promises that an
 *     unreachable PIN code gets contacted and refunded in full, and that
 *     promise is what the UI repeats rather than inventing a coverage map.
 */

export type ZoneId = "metro" | "standard" | "extended";

export interface DeliveryZone {
  id: ZoneId;
  /** The wording used on /shipping-policy — kept identical on purpose. */
  label: string;
  minDays: number;
  maxDays: number;
}

/** Working days in transit, after dispatch. */
export const DELIVERY_ZONES: Record<ZoneId, DeliveryZone> = {
  metro: { id: "metro", label: "Metro cities", minDays: 2, maxDays: 4 },
  standard: {
    id: "standard",
    label: "Other cities and towns",
    minDays: 4,
    maxDays: 7,
  },
  extended: {
    id: "extended",
    label: "Remote PIN codes, hill districts and the North East",
    minDays: 6,
    maxDays: 10,
  },
};

/** Working days between confirmation and handover to the courier. */
export const DISPATCH_DAYS = 1;

/**
 * Metro three-digit prefixes. Deliberately short: over-claiming metro speed
 * is the expensive direction of error, so a district that merely contains a
 * big city is not on this list. 400 covers Mumbai including Navi Mumbai;
 * Thane (421) and Raigad (410) are not here because both run well out into
 * semi-rural territory.
 */
const METRO_PREFIXES = new Set([
  "110", // Delhi
  "121", // Faridabad
  "122", // Gurugram
  "201", // Noida, Ghaziabad
  "380", // Ahmedabad
  "400", // Mumbai
  "411", // Pune
  "500", // Hyderabad
  "560", // Bengaluru
  "600", // Chennai
  "700", // Kolkata
]);

/**
 * Whole circles where every PIN code is an extended-transit destination:
 * Himachal, Jammu & Kashmir and Ladakh, Assam, and the other North Eastern
 * states.
 */
const EXTENDED_CIRCLES = new Set(["17", "18", "19", "78", "79"]);

/**
 * Extended by three-digit prefix — the hill and island districts inside
 * circles that are otherwise ordinary. See rule 1 above for why the mixed
 * ones (246, 249, 263) are here rather than in the standard band.
 */
const EXTENDED_PREFIXES = new Set([
  "246", // Pauri, Chamoli
  "249", // Tehri, Uttarkashi, Rudraprayag (also Haridwar — see rule 1)
  "262", // Pithoragarh, Champawat
  "263", // Almora, Bageshwar, Nainital
  "737", // Sikkim
  "744", // Andaman & Nicobar Islands
]);

/**
 * Places a two-digit circle names badly. Sikkim and the Andaman & Nicobar
 * Islands both live inside West Bengal's block, and Lakshadweep inside
 * Kerala's — so "737101 · West Bengal" would be a confident, wrong answer
 * shown to someone in Gangtok.
 *
 * Lakshadweep needs the full range rather than a prefix, because 682 is
 * Ernakulam on the mainland and only 68255x is the islands.
 */
function specificCircle(pincode: string): string | null {
  if (pincode.startsWith("68255")) return "Lakshadweep";
  if (pincode.startsWith("737")) return "Sikkim";
  if (pincode.startsWith("744")) return "Andaman & Nicobar Islands";
  return null;
}

/**
 * First two digits to postal circle. This is the Department of Posts'
 * own allocation, and it is a circle — roughly a state — not a city. We
 * show it back to the customer as confirmation that they typed what they
 * meant, which is all a two-digit prefix can honestly support.
 */
const CIRCLES: { prefixes: string[]; name: string }[] = [
  { prefixes: ["11"], name: "Delhi" },
  { prefixes: ["12", "13"], name: "Haryana" },
  { prefixes: ["14", "15", "16"], name: "Punjab & Chandigarh" },
  { prefixes: ["17"], name: "Himachal Pradesh" },
  { prefixes: ["18", "19"], name: "Jammu & Kashmir and Ladakh" },
  {
    prefixes: ["20", "21", "22", "23", "24", "25", "26", "27", "28"],
    name: "Uttar Pradesh & Uttarakhand",
  },
  { prefixes: ["30", "31", "32", "33", "34"], name: "Rajasthan" },
  { prefixes: ["36", "37", "38", "39"], name: "Gujarat" },
  { prefixes: ["40", "41", "42", "43", "44"], name: "Maharashtra & Goa" },
  { prefixes: ["45", "46", "47", "48"], name: "Madhya Pradesh" },
  { prefixes: ["49"], name: "Chhattisgarh" },
  { prefixes: ["50", "51", "52", "53"], name: "Telangana & Andhra Pradesh" },
  { prefixes: ["56", "57", "58", "59"], name: "Karnataka" },
  // 65 and 66 are absent because the Department of Posts never allocated
  // them. A six-digit number in that range is a typo, and falling through
  // to UNASSIGNED tells the customer that.
  { prefixes: ["60", "61", "62", "63", "64"], name: "Tamil Nadu & Puducherry" },
  { prefixes: ["67", "68", "69"], name: "Kerala" },
  { prefixes: ["70", "71", "72", "73", "74"], name: "West Bengal, Sikkim & the Andamans" },
  { prefixes: ["75", "76", "77"], name: "Odisha" },
  { prefixes: ["78"], name: "Assam" },
  { prefixes: ["79"], name: "Arunachal, Manipur, Meghalaya, Mizoram, Nagaland & Tripura" },
  { prefixes: ["80", "81", "82", "83", "84", "85"], name: "Bihar & Jharkhand" },
];

const CIRCLE_BY_PREFIX = new Map<string, string>(
  CIRCLES.flatMap(({ prefixes, name }) =>
    prefixes.map((prefix) => [prefix, name] as const),
  ),
);

export type ServiceabilityCode =
  | "OK"
  | "INVALID_FORMAT"
  | "UNASSIGNED"
  | "ARMY_POSTAL";

export interface ServiceabilityResult {
  code: ServiceabilityCode;
  pincode: string;
  /** Null unless code is OK. */
  circle: string | null;
  zone: DeliveryZone | null;
  /** Total working days from order confirmation, dispatch included. */
  minDays: number | null;
  maxDays: number | null;
  message: string;
}

function fail(
  code: Exclude<ServiceabilityCode, "OK">,
  pincode: string,
  message: string,
): ServiceabilityResult {
  return {
    code,
    pincode,
    circle: null,
    zone: null,
    minDays: null,
    maxDays: null,
    message,
  };
}

export function checkPincode(input: string): ServiceabilityResult {
  const pincode = input.replace(/\s/g, "");

  if (!/^\d{6}$/.test(pincode)) {
    return fail(
      "INVALID_FORMAT",
      pincode,
      "An Indian PIN code is six digits, with no letters or spaces.",
    );
  }

  const first = pincode[0];

  // 0 was never allocated. A six-digit number starting with one is a typo
  // every time, so say that rather than "not serviceable" — the customer
  // can act on a typo.
  if (first === "0") {
    return fail(
      "UNASSIGNED",
      pincode,
      "No Indian PIN code begins with 0 — check the first digit.",
    );
  }

  // 9 belongs to the Army Postal Service. These are genuine, deliverable
  // addresses, but they are reached through India Post's field post
  // offices, not through the private couriers we hand parcels to. Saying
  // "not serviceable" would be wrong and insulting; saying nothing would
  // strand the order.
  if (first === "9") {
    return fail(
      "ARMY_POSTAL",
      pincode,
      "That is an Army Postal Service address. Our couriers do not carry to field post offices — write to us before ordering and we will arrange India Post instead.",
    );
  }

  const circle = CIRCLE_BY_PREFIX.get(pincode.slice(0, 2)) ?? null;
  if (!circle) {
    return fail(
      "UNASSIGNED",
      pincode,
      "We do not recognise that PIN code. Please check it — if it is right, write to us and we will sort out delivery by hand.",
    );
  }

  const prefix3 = pincode.slice(0, 3);
  const prefix2 = pincode.slice(0, 2);
  const specific = specificCircle(pincode);

  let zone: DeliveryZone;
  if (
    specific !== null ||
    EXTENDED_PREFIXES.has(prefix3) ||
    EXTENDED_CIRCLES.has(prefix2)
  ) {
    // Every prefix that needed its own name is also an island or a hill
    // state, so the two conditions coincide. If that ever stops being true,
    // split them — do not assume it.
    zone = DELIVERY_ZONES.extended;
  } else if (METRO_PREFIXES.has(prefix3)) {
    zone = DELIVERY_ZONES.metro;
  } else {
    zone = DELIVERY_ZONES.standard;
  }

  const resolvedCircle = specific ?? circle;

  return {
    code: "OK",
    pincode,
    circle: resolvedCircle,
    zone,
    minDays: DISPATCH_DAYS + zone.minDays,
    maxDays: DISPATCH_DAYS + zone.maxDays,
    message: `${resolvedCircle} — ${DISPATCH_DAYS + zone.minDays} to ${DISPATCH_DAYS + zone.maxDays} working days from order.`,
  };
}
