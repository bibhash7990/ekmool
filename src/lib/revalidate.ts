import { revalidateTag, revalidatePath } from "next/cache";
import { PRODUCTS_TAG } from "@/db/queries/products";
import { PRODUCT_SLUGS } from "@/lib/constants";

/**
 * Invalidate everything that renders catalogue data. The tag covers the
 * cached SQL reads; the explicit paths are belt-and-braces for the routes
 * whose HTML embeds prices and stock.
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
