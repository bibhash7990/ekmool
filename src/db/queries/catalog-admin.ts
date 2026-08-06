import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * Writing the catalogue.
 *
 * Everything the storefront reads lives in src/db/queries/products.ts and is
 * cached behind the `products` tag. This is the other half: the owner's
 * side, uncached, and the only place in the codebase that writes a product.
 *
 * Two rules run through all of it.
 *
 * **Nothing is deleted.** A product or variant that has been ordered is part
 * of a financial record, and order_items.variant_id is ON DELETE SET NULL —
 * so a delete would not fail, it would quietly detach the line from the
 * variant it was sold as. Archiving (is_active = 0) removes it from the
 * catalogue, from search, and from checkout (createOrder requires
 * v.is_active = 1 AND p.is_active = 1), while leaving history intact.
 *
 * **Stock is not edited here.** setVariantStock in admin.ts owns it, because
 * a stock change from zero has to wake the back-in-stock queue and that
 * decision needs the previous value read under the same lock. An innocuous
 * `stock_qty = ?` in updateVariant would bypass it and silently strand
 * everyone waiting for the pack. The one exception is createVariant, where
 * there is no previous value and nobody can be waiting on a variant that
 * did not exist a moment ago.
 */

export type ProductAccent = "gold" | "terracotta" | "green";

export interface AdminProductSummary {
  id: number;
  slug: string;
  name: string;
  originState: string;
  isActive: boolean;
  sortOrder: number;
  variantCount: number;
  activeVariantCount: number;
  totalStock: number;
  imageCount: number;
  lowPricePaise: number | null;
  hsnCode: string | null;
  gstRateBps: number;
}

export interface AdminVariant {
  id: number;
  sku: string;
  packSizeLabel: string;
  packSizeGrams: number;
  pricePaise: number;
  mrpPaise: number;
  stockQty: number;
  lowStockThreshold: number;
  isActive: boolean;
  sortOrder: number;
}

export interface AdminImage {
  id: number;
  url: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
}

export interface AdminProduct {
  id: number;
  slug: string;
  name: string;
  originState: string;
  giTagName: string;
  shortDescription: string;
  longDescription: string;
  accent: ProductAccent;
  hsnCode: string | null;
  gstRateBps: number;
  seoTitle: string | null;
  seoDescription: string | null;
  isActive: boolean;
  sortOrder: number;
  variants: AdminVariant[];
  images: AdminImage[];
  /** Why the slug may be locked — see slugReferences(). */
  references: SlugReferences;
  /** True when src/content/products.ts has an editorial entry for the slug. */
  hasEditorialContent: boolean;
}

export interface ProductInput {
  slug: string;
  name: string;
  originState: string;
  giTagName: string;
  shortDescription: string;
  longDescription: string;
  accent: ProductAccent;
  hsnCode: string | null;
  gstRateBps: number;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface VariantInput {
  sku: string;
  packSizeLabel: string;
  packSizeGrams: number;
  pricePaise: number;
  mrpPaise: number;
  lowStockThreshold: number;
}

/* ------------------------------------------------------------------ */
/* Reading, for the admin                                              */

interface SummaryRow extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  origin_state: string;
  is_active: number;
  sort_order: number;
  hsn_code: string | null;
  gst_rate_bps: number;
  variant_count: number;
  active_variant_count: number;
  total_stock: number | null;
  image_count: number;
  low_price: number | null;
}

/**
 * Every product, archived ones included — the point of this list is to be
 * the whole catalogue, not the visible part of it.
 */
export async function listProductsForAdmin(): Promise<AdminProductSummary[]> {
  const pool = getPool();
  const [rows] = await pool.query<SummaryRow[]>(
    `SELECT p.id, p.slug, p.name, p.origin_state, p.is_active, p.sort_order,
            p.hsn_code, p.gst_rate_bps,
            (SELECT COUNT(*) FROM product_variants v
              WHERE v.product_id = p.id) AS variant_count,
            (SELECT COUNT(*) FROM product_variants v
              WHERE v.product_id = p.id AND v.is_active = 1)
              AS active_variant_count,
            (SELECT SUM(v.stock_qty) FROM product_variants v
              WHERE v.product_id = p.id AND v.is_active = 1) AS total_stock,
            (SELECT COUNT(*) FROM product_images i
              WHERE i.product_id = p.id) AS image_count,
            (SELECT MIN(v.price_inr) FROM product_variants v
              WHERE v.product_id = p.id AND v.is_active = 1) AS low_price
       FROM products p
      ORDER BY p.is_active DESC, p.sort_order, p.id`,
  );

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    originState: row.origin_state,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    variantCount: Number(row.variant_count),
    activeVariantCount: Number(row.active_variant_count),
    totalStock: Number(row.total_stock ?? 0),
    imageCount: Number(row.image_count),
    lowPricePaise: row.low_price === null ? null : Number(row.low_price),
    hsnCode: row.hsn_code,
    gstRateBps: Number(row.gst_rate_bps),
  }));
}

export interface SlugReferences {
  orderItems: number;
  reviews: number;
  wishlists: number;
  get total(): number;
}

/**
 * What would break if this slug changed.
 *
 * The slug is not just a URL. order_items.product_slug is a snapshot on
 * every line ever sold, reviews are keyed on it, wishlists are keyed on it,
 * and /products/<slug> is a page people have bookmarked and Google has
 * indexed. Renaming it would orphan all three and 404 the fourth, silently.
 *
 * So the slug is editable exactly while nothing points at it, and the admin
 * says which of these is holding it rather than refusing without a reason.
 */
export async function slugReferences(slug: string): Promise<SlugReferences> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM order_items WHERE product_slug = ?) AS order_items,
       (SELECT COUNT(*) FROM reviews WHERE product_slug = ?) AS reviews,
       (SELECT COUNT(*) FROM wishlist_items WHERE product_slug = ?) AS wishlists`,
    [slug, slug, slug],
  );

  const row = rows[0];
  const orderItems = Number(row?.order_items ?? 0);
  const reviews = Number(row?.reviews ?? 0);
  const wishlists = Number(row?.wishlists ?? 0);

  return {
    orderItems,
    reviews,
    wishlists,
    get total() {
      return orderItems + reviews + wishlists;
    },
  };
}

interface ProductDetailRow extends RowDataPacket {
  id: number;
  slug: string;
  name: string;
  origin_state: string;
  gi_tag_name: string;
  short_description: string;
  long_description: string;
  accent: ProductAccent;
  hsn_code: string | null;
  gst_rate_bps: number;
  seo_title: string | null;
  seo_description: string | null;
  is_active: number;
  sort_order: number;
}

interface VariantDetailRow extends RowDataPacket {
  id: number;
  sku: string;
  pack_size_label: string;
  pack_size_grams: number;
  price_inr: number;
  mrp_inr: number;
  stock_qty: number;
  low_stock_threshold: number;
  is_active: number;
  sort_order: number;
}

interface ImageDetailRow extends RowDataPacket {
  id: number;
  url: string;
  alt_text: string;
  sort_order: number;
  is_primary: number;
}

export async function getProductForAdmin(
  id: number,
): Promise<AdminProduct | null> {
  const pool = getPool();

  const [productRows] = await pool.execute<ProductDetailRow[]>(
    `SELECT id, slug, name, origin_state, gi_tag_name, short_description,
            long_description, accent, hsn_code, gst_rate_bps, seo_title,
            seo_description, is_active, sort_order
       FROM products WHERE id = ?`,
    [id],
  );
  const row = productRows[0];
  if (!row) return null;

  const [variantRows] = await pool.execute<VariantDetailRow[]>(
    `SELECT id, sku, pack_size_label, pack_size_grams, price_inr, mrp_inr,
            stock_qty, low_stock_threshold, is_active, sort_order
       FROM product_variants
      WHERE product_id = ?
      ORDER BY is_active DESC, sort_order, id`,
    [id],
  );

  const [imageRows] = await pool.execute<ImageDetailRow[]>(
    `SELECT id, url, alt_text, sort_order, is_primary
       FROM product_images
      WHERE product_id = ?
      ORDER BY sort_order, id`,
    [id],
  );

  const references = await slugReferences(row.slug);
  const { PRODUCT_CONTENT } = await import("@/content/products");

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    originState: row.origin_state,
    giTagName: row.gi_tag_name,
    shortDescription: row.short_description,
    longDescription: row.long_description,
    accent: row.accent,
    hsnCode: row.hsn_code,
    gstRateBps: Number(row.gst_rate_bps),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
    references,
    hasEditorialContent: Object.hasOwn(PRODUCT_CONTENT, row.slug),
    variants: variantRows.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      packSizeLabel: variant.pack_size_label,
      packSizeGrams: variant.pack_size_grams,
      pricePaise: variant.price_inr,
      mrpPaise: variant.mrp_inr,
      stockQty: variant.stock_qty,
      lowStockThreshold: variant.low_stock_threshold,
      isActive: variant.is_active === 1,
      sortOrder: variant.sort_order,
    })),
    images: imageRows.map((image) => ({
      id: image.id,
      url: image.url,
      altText: image.alt_text,
      sortOrder: image.sort_order,
      isPrimary: image.is_primary === 1,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Writing products                                                    */

export class SlugLockedError extends Error {
  // Assigned in the body rather than declared as a constructor parameter
  // property. Node's type stripping is erase-only and rejects the shorthand,
  // and scripts/test-admin.mjs imports this module directly.
  readonly references: SlugReferences;

  constructor(references: SlugReferences) {
    super("This slug is referenced by existing records");
    this.name = "SlugLockedError";
    this.references = references;
  }
}

/**
 * A new product, inactive.
 *
 * Created switched off deliberately. A product goes live with no variants,
 * no photographs and no price — publishing it the instant the name is typed
 * would put an empty page in front of a customer and in front of Google.
 * The owner switches it on when it is finished.
 */
export async function createProduct(input: ProductInput): Promise<number> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [maxRow] = await connection.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(sort_order), 0) AS n FROM products`,
    );

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO products
         (slug, name, origin_state, gi_tag_name, short_description,
          long_description, accent, hsn_code, gst_rate_bps, seo_title,
          seo_description, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        input.slug,
        input.name,
        input.originState,
        input.giTagName,
        input.shortDescription,
        input.longDescription,
        input.accent,
        input.hsnCode,
        input.gstRateBps,
        input.seoTitle,
        input.seoDescription,
        Number(maxRow[0]?.n ?? 0) + 1,
      ],
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Saves an edit and returns what the product looked like beforehand, so the
 * caller can write an audit entry describing the change rather than just
 * the outcome.
 *
 * Throws SlugLockedError rather than silently keeping the old slug. A save
 * that quietly discards one of the fields the owner typed is worse than a
 * refusal, because they will not notice.
 */
export async function updateProduct(
  id: number,
  input: ProductInput,
): Promise<AdminProduct | null> {
  const before = await getProductForAdmin(id);
  if (!before) return null;

  if (input.slug !== before.slug && before.references.total > 0) {
    throw new SlugLockedError(before.references);
  }

  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE products
        SET slug = ?, name = ?, origin_state = ?, gi_tag_name = ?,
            short_description = ?, long_description = ?, accent = ?,
            hsn_code = ?, gst_rate_bps = ?, seo_title = ?, seo_description = ?
      WHERE id = ?`,
    [
      input.slug,
      input.name,
      input.originState,
      input.giTagName,
      input.shortDescription,
      input.longDescription,
      input.accent,
      input.hsnCode,
      input.gstRateBps,
      input.seoTitle,
      input.seoDescription,
      id,
    ],
  );

  return before;
}

export interface PublishRefusal {
  ok: false;
  reason: "not_found" | "no_active_variant" | "no_image";
}

export type PublishResult = { ok: true; slug: string } | PublishRefusal;

/**
 * Switching a product on, or archiving it.
 *
 * Going live is checked; going dark is not. A product with no purchasable
 * variant is a page with a price range of nothing and an Add-to-basket
 * button that cannot work, and a product with no photograph is one nobody
 * will buy — both are mistakes the owner wants caught before a customer
 * finds them, not after. Archiving has no such conditions, because the
 * whole point of it is to be able to pull something immediately.
 */
export async function setProductActive(
  id: number,
  active: boolean,
): Promise<PublishResult> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT slug,
              (SELECT COUNT(*) FROM product_variants v
                WHERE v.product_id = products.id AND v.is_active = 1) AS variants,
              (SELECT COUNT(*) FROM product_images i
                WHERE i.product_id = products.id) AS images
         FROM products WHERE id = ? FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return { ok: false, reason: "not_found" };
    }

    if (active && Number(row.variants) === 0) {
      await connection.rollback();
      return { ok: false, reason: "no_active_variant" };
    }
    if (active && Number(row.images) === 0) {
      await connection.rollback();
      return { ok: false, reason: "no_image" };
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE products SET is_active = ? WHERE id = ?`,
      [active ? 1 : 0, id],
    );

    await connection.commit();
    return { ok: true, slug: row.slug as string };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * The order products appear in, written as a whole list rather than as a
 * pair of swaps. One statement per row inside one transaction: a reorder
 * that half-applied would leave two products claiming position three.
 */
export async function reorderProducts(orderedIds: number[]): Promise<number> {
  if (orderedIds.length === 0) return 0;

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    let moved = 0;

    for (const [index, id] of orderedIds.entries()) {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE products SET sort_order = ? WHERE id = ?`,
        [index + 1, id],
      );
      moved += result.affectedRows;
    }

    await connection.commit();
    return moved;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/* ------------------------------------------------------------------ */
/* Writing variants                                                    */

export async function createVariant(
  productId: number,
  input: VariantInput & { stockQty: number },
): Promise<number> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [maxRow] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(sort_order), 0) AS n FROM product_variants
        WHERE product_id = ?`,
      [productId],
    );

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO product_variants
         (product_id, sku, pack_size_label, pack_size_grams, price_inr,
          mrp_inr, stock_qty, low_stock_threshold, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        productId,
        input.sku,
        input.packSizeLabel,
        input.packSizeGrams,
        input.pricePaise,
        input.mrpPaise,
        Math.max(0, Math.floor(input.stockQty)),
        input.lowStockThreshold,
        Number(maxRow[0]?.n ?? 0) + 1,
      ],
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Edits a variant and returns what it was.
 *
 * stock_qty is not in the UPDATE. See the note at the top of this file:
 * setVariantStock owns it because a restock from zero has to notify the
 * waiting list, and that decision needs the previous value under the lock
 * that writes the new one.
 */
export async function updateVariant(
  productId: number,
  variantId: number,
  input: VariantInput,
): Promise<AdminVariant | null> {
  const pool = getPool();

  // product_id is in the WHERE of both statements even though the variant id
  // alone is unique. It makes "you cannot edit another product's variant" a
  // property of the query rather than of the caller remembering to check.
  const [rows] = await pool.execute<VariantDetailRow[]>(
    `SELECT id, sku, pack_size_label, pack_size_grams, price_inr, mrp_inr,
            stock_qty, low_stock_threshold, is_active, sort_order
       FROM product_variants WHERE id = ? AND product_id = ?`,
    [variantId, productId],
  );
  const row = rows[0];
  if (!row) return null;

  await pool.execute<ResultSetHeader>(
    `UPDATE product_variants
        SET sku = ?, pack_size_label = ?, pack_size_grams = ?, price_inr = ?,
            mrp_inr = ?, low_stock_threshold = ?
      WHERE id = ? AND product_id = ?`,
    [
      input.sku,
      input.packSizeLabel,
      input.packSizeGrams,
      input.pricePaise,
      input.mrpPaise,
      input.lowStockThreshold,
      variantId,
      productId,
    ],
  );

  return {
    id: row.id,
    sku: row.sku,
    packSizeLabel: row.pack_size_label,
    packSizeGrams: row.pack_size_grams,
    pricePaise: row.price_inr,
    mrpPaise: row.mrp_inr,
    stockQty: row.stock_qty,
    lowStockThreshold: row.low_stock_threshold,
    isActive: row.is_active === 1,
    sortOrder: row.sort_order,
  };
}

export type VariantArchiveResult =
  | { ok: true; sku: string; productArchived: boolean }
  | { ok: false; reason: "not_found" | "last_active_variant" };

/**
 * Archiving a variant, never deleting one.
 *
 * Refuses to archive the last active variant of a *live* product, which
 * would leave a published page with nothing to sell — the owner almost
 * certainly meant to archive the product. Archiving the last variant of an
 * already-archived product is fine and is the ordinary way to tidy up.
 */
export async function setVariantActive(
  productId: number,
  variantId: number,
  active: boolean,
): Promise<VariantArchiveResult> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT v.sku, v.is_active, p.is_active AS product_active,
              (SELECT COUNT(*) FROM product_variants o
                WHERE o.product_id = v.product_id AND o.is_active = 1
                  AND o.id <> v.id) AS other_active
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
        WHERE v.id = ? AND v.product_id = ?
        FOR UPDATE`,
      [variantId, productId],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return { ok: false, reason: "not_found" };
    }

    const productLive = row.product_active === 1;
    if (!active && productLive && Number(row.other_active) === 0) {
      await connection.rollback();
      return { ok: false, reason: "last_active_variant" };
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE product_variants SET is_active = ? WHERE id = ? AND product_id = ?`,
      [active ? 1 : 0, variantId, productId],
    );

    await connection.commit();
    return {
      ok: true,
      sku: row.sku as string,
      productArchived: !productLive,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Pack order on the product page. Scoped to the product, as above. */
export async function reorderVariants(
  productId: number,
  orderedIds: number[],
): Promise<number> {
  if (orderedIds.length === 0) return 0;

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    let moved = 0;

    for (const [index, id] of orderedIds.entries()) {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE product_variants SET sort_order = ?
          WHERE id = ? AND product_id = ?`,
        [index + 1, id, productId],
      );
      moved += result.affectedRows;
    }

    await connection.commit();
    return moved;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/* ------------------------------------------------------------------ */
/* Images                                                              */

/**
 * Images are the one thing here that really is deleted.
 *
 * A photograph is not a financial record and nothing snapshots it: an order
 * line carries the product name and pack size, never an image id. Keeping a
 * removed photo around as `is_active = 0` would only be a way to accumulate
 * files nobody can see and nobody remembers.
 */
export async function addProductImage(
  productId: number,
  image: { url: string; altText: string },
): Promise<number> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [counts] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n, COALESCE(MAX(sort_order), 0) AS last_order
         FROM product_images WHERE product_id = ? FOR UPDATE`,
      [productId],
    );
    const existing = Number(counts[0]?.n ?? 0);

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO product_images (product_id, url, alt_text, sort_order, is_primary)
       VALUES (?, ?, ?, ?, ?)`,
      [
        productId,
        image.url,
        image.altText,
        Number(counts[0]?.last_order ?? 0) + 1,
        // The first photograph is the primary one whether or not it was
        // asked for. Otherwise a product has images and no hero, and the
        // card falls back to a placeholder for no visible reason.
        existing === 0 ? 1 : 0,
      ],
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateImageAlt(
  productId: number,
  imageId: number,
  altText: string,
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE product_images SET alt_text = ? WHERE id = ? AND product_id = ?`,
    [altText, imageId, productId],
  );
  return result.affectedRows > 0;
}

/** Exactly one primary, enforced in one transaction. */
export async function setPrimaryImage(
  productId: number,
  imageId: number,
): Promise<boolean> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [owned] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM product_images WHERE id = ? AND product_id = ? FOR UPDATE`,
      [imageId, productId],
    );
    if (owned.length === 0) {
      await connection.rollback();
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE product_images SET is_primary = 0 WHERE product_id = ?`,
      [productId],
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?`,
      [imageId, productId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Removing the primary promotes the next image, so one always remains. */
export async function deleteProductImage(
  productId: number,
  imageId: number,
): Promise<boolean> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT is_primary FROM product_images
        WHERE id = ? AND product_id = ? FOR UPDATE`,
      [imageId, productId],
    );
    if (rows.length === 0) {
      await connection.rollback();
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM product_images WHERE id = ? AND product_id = ?`,
      [imageId, productId],
    );

    if (rows[0].is_primary === 1) {
      await connection.execute<ResultSetHeader>(
        `UPDATE product_images SET is_primary = 1
          WHERE product_id = ? ORDER BY sort_order, id LIMIT 1`,
        [productId],
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function reorderImages(
  productId: number,
  orderedIds: number[],
): Promise<number> {
  if (orderedIds.length === 0) return 0;

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    let moved = 0;

    for (const [index, id] of orderedIds.entries()) {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE product_images SET sort_order = ?
          WHERE id = ? AND product_id = ?`,
        [index + 1, id, productId],
      );
      moved += result.affectedRows;
    }

    await connection.commit();
    return moved;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
