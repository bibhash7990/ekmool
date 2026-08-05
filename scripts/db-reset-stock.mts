/**
 * Reset every variant's stock to its seeded quantity.
 *
 * `db:seed` deliberately will not do this — it only sets stock on first
 * insert, so that re-running it against production can never wipe real
 * inventory. That safety leaves a gap in development: acceptance and load
 * suites place real orders and decrement real stock, and there is no way
 * back short of dropping the volume.
 *
 * This is that way back. DEVELOPMENT ONLY — it overwrites stock
 * unconditionally, which is exactly what you must never do to a live shop.
 *
 *   npm run db:reset-stock
 */
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";
import { SEED_PRODUCTS } from "../src/db/seed/products.seed.ts";

loadEnv();

if (process.env.NODE_ENV === "production") {
  console.error(
    "Refusing to run with NODE_ENV=production — this overwrites stock unconditionally.",
  );
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? "ekmool",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "ekmool",
});

let changed = 0;
let total = 0;

for (const product of SEED_PRODUCTS) {
  for (const variant of product.variants) {
    const [result] = await connection.execute(
      "UPDATE product_variants SET stock_qty = ? WHERE sku = ? AND stock_qty <> ?",
      [variant.stockQty, variant.sku, variant.stockQty],
    );
    total += variant.stockQty;
    if ((result as mysql.ResultSetHeader).affectedRows > 0) {
      console.log(`  reset  ${variant.sku} -> ${variant.stockQty}`);
      changed += 1;
    }
  }
}

console.log(
  `\n${changed} variant(s) reset. Catalogue now holds ${total} units.`,
);

await connection.end();
