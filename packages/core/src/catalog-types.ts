/**
 * The catalogue's shape.
 *
 * These three interfaces were declared in `apps/web/src/db/queries/products.ts`,
 * beside the SQL that builds them. That was the honest place for them while
 * MySQL was the only thing that ever produced a `Product` — but `search.ts`
 * already imported the type without wanting the query module, and anything
 * else that consumes the catalogue over HTTP wants the same. So the shape
 * lives here, in a file that imports nothing, and the query module imports it
 * back and re-exports it.
 *
 * Field names are the camelCase ones the mappers in `products.ts` produce,
 * not the snake_case column names. This describes the catalogue as the
 * application sees it, not as the database stores it.
 */

export interface ProductVariant {
  id: number;
  sku: string;
  packSizeLabel: string;
  packSizeGrams: number;
  pricePaise: number;
  mrpPaise: number;
  stockQty: number;
  lowStockThreshold: number;
}

export interface ProductImage {
  url: string;
  altText: string;
  isPrimary: boolean;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  originState: string;
  giTagName: string;
  shortDescription: string;
  longDescription: string;
  accent: "gold" | "terracotta" | "green";
  /**
   * Owner-supplied title tag and meta description, or null.
   *
   * Null is the normal case for the launch products: src/content/products.ts
   * holds hand-written copy for those and is the better source. These exist
   * for products created in the admin, which have no editorial entry and
   * cannot get one without a deploy.
   */
  seoTitle: string | null;
  seoDescription: string | null;
  variants: ProductVariant[];
  images: ProductImage[];
}
