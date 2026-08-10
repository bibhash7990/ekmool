import type { Product } from "@/db/queries/products";

/**
 * Related products for a product page.
 *
 * There is no recommendation engine here and the copy does not pretend
 * there is. With five products on the shelf, "you may also like" would be a
 * claim about behaviour we have not measured — so each suggestion carries
 * the actual reason it is being shown, and the reasons are rules anyone can
 * check: same food from a different district first, then what genuinely
 * goes in the same pot, then the rest of the shelf.
 *
 * When there are real purchase histories to mine (M13 onwards), this is the
 * seam to replace — the component takes `{ product, reason }` and does not
 * care where the ordering came from.
 */

/**
 * Families are read off the product name rather than stored, because the
 * catalogue has no family column and inventing one in the database to hold
 * a word already in `name` would be two sources for one fact. A product
 * whose name matches nothing is simply unfamilied, and falls through to the
 * shelf ordering.
 */
const FAMILIES = ["turmeric", "makhana", "chilli"] as const;
export type Family = (typeof FAMILIES)[number];

/** Foods that end up in the same pan. Symmetric by construction below. */
const COMPLEMENTS: Partial<Record<Family, Family>> = {
  turmeric: "chilli",
  chilli: "turmeric",
};

/** Also the /products family filter — one definition, two readers. */
export function familyOf(product: Product): Family | null {
  const name = product.name.toLowerCase();
  return FAMILIES.find((family) => name.includes(family)) ?? null;
}

export interface RelatedProduct {
  product: Product;
  /** Shown under the card. Always a fact about the product, never a claim
      about what other people bought. */
  reason: string;
}

export function relatedProducts(
  catalog: Product[],
  current: Product,
  limit = 3,
): RelatedProduct[] {
  const currentFamily = familyOf(current);
  const complement = currentFamily ? COMPLEMENTS[currentFamily] : undefined;

  const scored = catalog
    .filter((candidate) => candidate.slug !== current.slug)
    .map((candidate) => {
      const family = familyOf(candidate);

      if (family && family === currentFamily) {
        return {
          product: candidate,
          rank: 0,
          reason: `The same ${family}, grown in ${candidate.originState} instead.`,
        };
      }

      if (complement && family === complement) {
        return {
          product: candidate,
          rank: 1,
          reason: "Goes in the same pot, at the same point in the cooking.",
        };
      }

      return {
        product: candidate,
        rank: 2,
        reason: `Single origin from ${candidate.originState}, GI-tagged as ${candidate.giTagName}.`,
      };
    });

  // Stable within a rank: catalogue order, which is the order the owner set.
  return scored
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ product, reason }) => ({ product, reason }));
}
