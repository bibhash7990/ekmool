import type {
  CatalogDocument,
  ContentDocument,
  ReviewsDocument,
} from "@ekmool/contracts/documents";

/**
 * The three static catalogue documents, as this app addresses them.
 *
 * Paths and cache keys in one place so a screen names a document rather than
 * a URL. They are files served out of Next's static output — see
 * `apps/web/src/app/catalog/v1.json/route.ts` — not API routes, so they are
 * not under `/api`, they are not rate limited, and they keep serving while
 * MySQL is down. The phone inherits that property by reading them; it must
 * not undo it by adding a dynamic fallback.
 *
 * Three documents and not one, for the reason the contract states: reviews
 * and the catalogue are purged by different tags, and a combined document
 * would make one moderated review invalidate the catalogue for the entire
 * install base.
 *
 * The `-v1` in each name is the *document format* version. A v2 appears
 * beside a v1, both served, until the old clients are gone — so a client
 * built today keeps working after one is minted, which is the whole point of
 * naming them here rather than deriving them.
 */
export interface DocumentDescriptor {
  /** Origin-relative. The origin lives in `src/api/client.ts` and nowhere else. */
  path: string;
  /** The `expo-sqlite/kv-store` key its body and ETag are filed under. */
  cacheKey: string;
}

export const CATALOG_DOCUMENT: DocumentDescriptor = {
  path: "/catalog/v1.json",
  cacheKey: "catalog-v1",
};

export const REVIEWS_DOCUMENT: DocumentDescriptor = {
  path: "/catalog/reviews-v1.json",
  cacheKey: "reviews-v1",
};

export const CONTENT_DOCUMENT: DocumentDescriptor = {
  path: "/catalog/content-v1.json",
  cacheKey: "content-v1",
};

/** Re-exported so a screen needs one import to fetch and type a document. */
export type { CatalogDocument, ContentDocument, ReviewsDocument };
