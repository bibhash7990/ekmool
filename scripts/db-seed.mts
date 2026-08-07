/**
 * Idempotent catalog seed. Re-running updates existing rows by their
 * natural keys (product slug, variant sku) rather than duplicating —
 * stock quantities are only set on first insert so a reseed never wipes
 * live inventory.
 *
 * Run with: npm run db:seed
 */
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";
import { SEED_PRODUCTS } from "../src/db/seed/products.seed.ts";

async function main(): Promise<void> {
  loadEnv();

  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    user: process.env.DATABASE_USER ?? "ekmool",
    password: process.env.DATABASE_PASSWORD ?? "",
    database: process.env.DATABASE_NAME ?? "ekmool",
    // See db-migrate.mts — seeding a managed database needs TLS too.
    ...(/^(1|true|yes)$/i.test((process.env.DATABASE_SSL ?? "").trim())
      ? { ssl: { minVersion: "TLSv1.2" as const } }
      : {}),
  });

  try {
    for (const product of SEED_PRODUCTS) {
      await connection.query(
        `INSERT INTO products
           (slug, name, origin_state, gi_tag_name, short_description,
            long_description, accent, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           origin_state = VALUES(origin_state),
           gi_tag_name = VALUES(gi_tag_name),
           short_description = VALUES(short_description),
           long_description = VALUES(long_description),
           accent = VALUES(accent),
           is_active = 1`,
        [
          product.slug,
          product.name,
          product.originState,
          product.giTagName,
          product.shortDescription,
          product.longDescription,
          product.accent,
        ],
      );

      const [rows] = await connection.query(
        "SELECT id FROM products WHERE slug = ?",
        [product.slug],
      );
      const productId = (rows as Array<{ id: number }>)[0].id;

      for (const [index, variant] of product.variants.entries()) {
        await connection.query(
          `INSERT INTO product_variants
             (product_id, sku, pack_size_label, pack_size_grams, price_inr,
              mrp_inr, stock_qty, low_stock_threshold, sort_order, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             pack_size_label = VALUES(pack_size_label),
             pack_size_grams = VALUES(pack_size_grams),
             price_inr = VALUES(price_inr),
             mrp_inr = VALUES(mrp_inr),
             low_stock_threshold = VALUES(low_stock_threshold),
             sort_order = VALUES(sort_order),
             is_active = 1`,
          [
            productId,
            variant.sku,
            variant.packSizeLabel,
            variant.packSizeGrams,
            variant.pricePaise,
            variant.mrpPaise,
            variant.stockQty,
            variant.lowStockThreshold,
            index,
          ],
        );
      }

      // Images have no natural unique key; replace the set wholesale.
      await connection.query("DELETE FROM product_images WHERE product_id = ?", [
        productId,
      ]);
      for (const [index, image] of product.images.entries()) {
        await connection.query(
          `INSERT INTO product_images
             (product_id, url, alt_text, sort_order, is_primary)
           VALUES (?, ?, ?, ?, ?)`,
          [productId, image.url, image.altText, index, image.isPrimary ? 1 : 0],
        );
      }

      console.log(
        `  seeded ${product.slug} (${product.variants.length} variants, ${product.images.length} images)`,
      );
    }

    const [[counts]] = (await connection.query(
      `SELECT
         (SELECT COUNT(*) FROM products) AS products,
         (SELECT COUNT(*) FROM product_variants) AS variants,
         (SELECT COUNT(*) FROM product_images) AS images`,
    )) as [Array<Record<string, number>>, unknown];

    console.log(
      `Seed complete: ${counts.products} products, ${counts.variants} variants, ${counts.images} images.`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
