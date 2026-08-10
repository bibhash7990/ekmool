import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * Back-in-stock interest.
 *
 * A single email about one pack, sent once, to someone who asked for it.
 * Nothing here is a mailing list and nothing here feeds one: there is no
 * name column, no marketing flag, and the row is settled the moment the
 * mail goes out.
 */

export interface PendingNotification {
  id: number;
  email: string;
  sku: string;
  packSizeLabel: string;
  productName: string;
  productSlug: string;
  pricePaise: number;
}

interface PendingRow extends RowDataPacket {
  id: number;
  email: string;
  sku: string;
  pack_size_label: string;
  product_name: string;
  product_slug: string;
  price_inr: number;
}

export type RequestOutcome =
  | "registered"
  | "already_waiting"
  | "unknown_variant"
  | "in_stock";

/**
 * Records interest in a variant. Idempotent by design: asking twice bumps
 * a counter rather than creating a second row, so nobody can queue
 * themselves for ten copies of the same email.
 *
 * Re-asking after a previous notification clears `notified_at`, which puts
 * the person back in the queue — the pack sold out again, and they want to
 * know again.
 */
export async function requestBackInStock(params: {
  variantId: number;
  email: string;
}): Promise<RequestOutcome> {
  const pool = getPool();
  const email = params.email.trim().toLowerCase();

  const [variants] = await pool.execute<RowDataPacket[]>(
    `SELECT id, stock_qty FROM product_variants WHERE id = ? AND is_active = 1`,
    [params.variantId],
  );
  const variant = variants[0];
  if (!variant) return "unknown_variant";

  // The pack has to actually be out of stock. Notification only ever fires
  // on a restock — a variant crossing from zero to positive — so a row
  // created against a pack already on the shelf would wait for an event
  // that has just been and gone, and the person would never hear anything.
  //
  // The stale-catalogue case is the reason this is checked here rather than
  // trusted from the page: /products/[slug] is served from an hourly cache,
  // so a form submitted from a page rendered before the restock arrives
  // here after it. Refusing is right, and the caller says so.
  if (Number(variant.stock_qty) > 0) return "in_stock";

  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT id, notified_at FROM back_in_stock_requests
      WHERE variant_id = ? AND email = ?`,
    [params.variantId, email],
  );

  await pool.execute<ResultSetHeader>(
    `INSERT INTO back_in_stock_requests (variant_id, email)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
       request_count = request_count + 1,
       notified_at = NULL`,
    [params.variantId, email],
  );

  // "Already waiting" only if they were still in the queue. Someone who was
  // notified and has come back is newly registered as far as they are
  // concerned, and telling them otherwise would be confusing.
  return existing[0] && existing[0].notified_at === null
    ? "already_waiting"
    : "registered";
}

/** Everyone still waiting on a variant, with what they are waiting for. */
export async function listPendingForVariant(
  variantId: number,
): Promise<PendingNotification[]> {
  const pool = getPool();
  const [rows] = await pool.execute<PendingRow[]>(
    `SELECT r.id, r.email, v.sku, v.pack_size_label, v.price_inr,
            p.name AS product_name, p.slug AS product_slug
       FROM back_in_stock_requests r
       JOIN product_variants v ON v.id = r.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE r.variant_id = ? AND r.notified_at IS NULL
      ORDER BY r.created_at ASC`,
    [variantId],
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    sku: row.sku,
    packSizeLabel: row.pack_size_label,
    productName: row.product_name,
    productSlug: row.product_slug,
    pricePaise: row.price_inr,
  }));
}

/**
 * Stamps rows as notified. Takes the ids the caller actually sent to, not
 * the variant — a send that half-failed must not mark the other half done.
 */
export async function markNotified(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const pool = getPool();
  const placeholders = ids.map(() => "?").join(",");
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE back_in_stock_requests
        SET notified_at = NOW()
      WHERE id IN (${placeholders})`,
    ids,
  );
  return result.affectedRows;
}

export interface WaitingCount {
  variantId: number;
  sku: string;
  productName: string;
  packSizeLabel: string;
  waiting: number;
}

/** How many people are waiting on each out-of-stock pack. For the admin. */
export async function countWaiting(): Promise<WaitingCount[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT v.id, v.sku, v.pack_size_label, p.name AS product_name,
            COUNT(*) AS waiting
       FROM back_in_stock_requests r
       JOIN product_variants v ON v.id = r.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE r.notified_at IS NULL
      GROUP BY v.id, v.sku, v.pack_size_label, p.name
      ORDER BY waiting DESC, p.name`,
  );

  return rows.map((row) => ({
    variantId: Number(row.id),
    sku: row.sku as string,
    productName: row.product_name as string,
    packSizeLabel: row.pack_size_label as string,
    waiting: Number(row.waiting),
  }));
}
