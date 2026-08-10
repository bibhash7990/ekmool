import { getCatalog } from "@/db/queries/products";
import { documentResponse, toCatalogDocument } from "@/lib/catalog-document";

/**
 * GET /catalog/v1.json — the catalogue, as a file.
 *
 * Row one of docs/ARCHITECTURE.md's rendering table: static,
 * `revalidate = 3600`, does not touch MySQL at request time. It is filed
 * beside `/` and `/products` rather than under `/api` on purpose — src/proxy.ts
 * matches `/api/:path*`, and putting a file that never changes between purges
 * behind a Node hop and a rate-limit check would be paying for protection
 * that a CDN gives away. It would also file it in the row a future reader
 * reads as "dynamic, add a query here".
 *
 * WHY IT REUSES getCatalog()
 *
 * `getCatalog` is already `unstable_cache(loadCatalog, ["catalog"], { tags:
 * [PRODUCTS_TAG], revalidate: 3600 })`. Reusing it — rather than writing a
 * leaner query shaped for a phone — is the entire reason this route needs no
 * invalidation story of its own. `revalidateCatalog()` already calls
 * `revalidateTag(PRODUCTS_TAG, "max")`, and an admin stock edit already calls
 * `revalidateCatalog()`. Nothing was added to the purge path; this document
 * simply joined the set of things that tag already covers.
 *
 * Rule 9 applies with full force. `revalidateTag(PRODUCTS_TAG)`, never
 * `revalidatePath("/catalog/v1.json")` — a path purge deletes the entry, and
 * with it the app's only source of products. src/lib/revalidate.ts is where
 * that rule is enforced and it does not name this path.
 *
 * WHY THIS DOCUMENT DOES NOT CARRY REVIEWS
 *
 * Separate documents, separate tags. See reviews-v1.json/route.ts.
 */

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * No `request` parameter, and that is not an oversight.
 *
 * Under `force-static` Next hands the handler a proxied request whose
 * headers, cookies and search params are empty stubs, so any of them read
 * here would be silently and permanently empty. Not accepting the argument
 * is the cheapest way to stop someone reaching for `If-None-Match` in a
 * later edit and shipping a branch that never fires. The reason the 304 is
 * not answered here, and where it is answered instead, is written up over
 * `documentResponse` in src/lib/catalog-document.ts.
 */
export async function GET(): Promise<Response> {
  const products = await getCatalog();
  return documentResponse(toCatalogDocument(products));
}
