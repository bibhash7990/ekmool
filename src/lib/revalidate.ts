import { revalidateTag, revalidatePath } from "next/cache";
import { PRODUCTS_TAG } from "@/db/queries/products";
import { PRODUCT_SLUGS } from "@/lib/constants";

/**
 * Invalidate everything that renders catalogue data. The tag covers the
 * cached SQL reads; the explicit paths are belt-and-braces for the routes
 * whose HTML embeds prices and stock.
 *
 * Call this from ADMIN and publish actions only — never on the checkout
 * path. Purging a page discards the copy that would otherwise be served
 * while the database is unreachable, and forces a DB round trip to
 * rebuild it. Ordinary stock movement rides the hourly ISR window
 * instead; the atomic decrement in createOrder is what actually prevents
 * overselling.
 */
export function revalidateCatalog(): void {
  revalidateTag(PRODUCTS_TAG, "max");
  revalidatePath("/");
  revalidatePath("/products");
  for (const slug of PRODUCT_SLUGS) {
    revalidatePath(`/products/${slug}`);
  }
  revalidatePath("/sitemap.xml");
}
