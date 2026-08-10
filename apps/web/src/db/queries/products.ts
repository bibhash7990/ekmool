import { unstable_cache } from "next/cache";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * Catalog reads. Every export is wrapped in unstable_cache with the
 * 'products' tag so build-time SSG, ISR regeneration, and on-demand
 * revalidateTag('products', 'max') all share one invalidation story.
 *
 * Browsing pages call these at BUILD time only — with `revalidate = 3600`
 * on the page, a running server never touches MySQL to render them.
 */

export const PRODUCTS_TAG = "products";
const REVALIDATE_SECONDS = 3600;

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

interface ProductRow extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  origin_state: string;
  gi_tag_name: string;
  short_description: string;
  long_description: string;
  accent: "gold" | "terracotta" | "green";
  seo_title: string | null;
  seo_description: string | null;
}

interface VariantRow extends RowDataPacket {
  id: number;
  product_id: number;
  sku: string;
  pack_size_label: string;
  pack_size_grams: number;
  price_inr: number;
  mrp_inr: number;
  stock_qty: number;
  low_stock_threshold: number;
}

interface ImageRow extends RowDataPacket {
  product_id: number;
  url: string;
  alt_text: string;
  is_primary: number;
}

async function loadCatalog(): Promise<Product[]> {
  const pool = getPool();

  const [productRows] = await pool.query<ProductRow[]>(
    `SELECT id, slug, name, origin_state, gi_tag_name, short_description,
            long_description, accent, seo_title, seo_description
       FROM products
      WHERE is_active = 1
      ORDER BY sort_order, id`,
  );

  if (productRows.length === 0) return [];

  const [variantRows] = await pool.query<VariantRow[]>(
    `SELECT id, product_id, sku, pack_size_label, pack_size_grams, price_inr,
            mrp_inr, stock_qty, low_stock_threshold
       FROM product_variants
      WHERE is_active = 1
      ORDER BY product_id, sort_order, id`,
  );

  const [imageRows] = await pool.query<ImageRow[]>(
    `SELECT product_id, url, alt_text, is_primary
       FROM product_images
      ORDER BY product_id, sort_order, id`,
  );

  return productRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    originState: row.origin_state,
    giTagName: row.gi_tag_name,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    accent: row.accent,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    variants: variantRows
      .filter((v) => v.product_id === row.id)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        packSizeLabel: v.pack_size_label,
        packSizeGrams: v.pack_size_grams,
        pricePaise: v.price_inr,
        mrpPaise: v.mrp_inr,
        stockQty: v.stock_qty,
        lowStockThreshold: v.low_stock_threshold,
      })),
    images: imageRows
      .filter((i) => i.product_id === row.id)
      .map((i) => ({
        url: i.url,
        altText: i.alt_text,
        isPrimary: i.is_primary === 1,
      })),
  }));
}

/** All active products with variants + images. */
export const getCatalog = unstable_cache(loadCatalog, ["catalog"], {
  tags: [PRODUCTS_TAG],
  revalidate: REVALIDATE_SECONDS,
});

/** One product by slug, or null. */
export async function getProductBySlug(
  slug: string,
): Promise<Product | null> {
  const catalog = await getCatalog();
  return catalog.find((p) => p.slug === slug) ?? null;
}
