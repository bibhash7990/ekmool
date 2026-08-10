import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";
import {
  ORDER_STATUSES,
  isOrderStatus,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-status";

export { ORDER_STATUSES, isOrderStatus };

export interface AdminOrderRow {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: "cod" | "razorpay";
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  totalPaise: number;
  trackingId: string | null;
  itemCount: number;
  createdAt: Date;
}

interface AdminOrderDbRow extends RowDataPacket {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_city: string;
  address_state: string;
  address_pincode: string;
  payment_method: "cod" | "razorpay";
  payment_status: PaymentStatus;
  status: OrderStatus;
  total_paise: number;
  tracking_id: string | null;
  item_count: number;
  created_at: Date;
}

export async function listOrders(filter?: {
  status?: OrderStatus;
  limit?: number;
}): Promise<AdminOrderRow[]> {
  const pool = getPool();
  const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);

  // LIMIT is interpolated (after clamping to an integer) because MySQL
  // will not accept a placeholder there in a prepared statement.
  const where = filter?.status ? "WHERE o.status = ?" : "";
  const params = filter?.status ? [filter.status] : [];

  const [rows] = await pool.query<AdminOrderDbRow[]>(
    `SELECT o.id, o.customer_name, o.customer_email, o.customer_phone,
            o.address_city, o.address_state, o.address_pincode,
            o.payment_method, o.payment_status, o.status, o.total_paise,
            o.tracking_id, o.created_at,
            (SELECT COALESCE(SUM(qty), 0) FROM order_items i
              WHERE i.order_id = o.id) AS item_count
       FROM orders o
       ${where}
      ORDER BY o.created_at DESC
      LIMIT ${limit}`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    city: row.address_city,
    state: row.address_state,
    pincode: row.address_pincode,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    totalPaise: row.total_paise,
    trackingId: row.tracking_id,
    itemCount: Number(row.item_count),
    createdAt: row.created_at,
  }));
}

export interface OrderCounts {
  status: OrderStatus;
  count: number;
}

export async function countOrdersByStatus(): Promise<OrderCounts[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT status, COUNT(*) AS n FROM orders GROUP BY status`,
  );
  const counts = new Map(
    rows.map((r) => [r.status as OrderStatus, Number(r.n)]),
  );
  return ORDER_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  }));
}

/**
 * Applies a status change and records it. Returns the previous status so
 * the caller can decide whether a customer email is warranted — the
 * shipping email must fire on the transition, never on a re-save.
 */
export async function updateOrderStatus(params: {
  orderId: string;
  status: OrderStatus;
  trackingId?: string | null;
  actor: string;
}): Promise<{ changed: boolean; previous: OrderStatus | null }> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT status, tracking_id FROM orders WHERE id = ? FOR UPDATE`,
      [params.orderId],
    );
    const current = rows[0];
    if (!current) {
      await connection.rollback();
      return { changed: false, previous: null };
    }

    const previous = current.status as OrderStatus;
    const nextTracking =
      params.trackingId === undefined
        ? (current.tracking_id as string | null)
        : params.trackingId || null;

    const statusChanged = previous !== params.status;
    const trackingChanged = nextTracking !== current.tracking_id;

    if (!statusChanged && !trackingChanged) {
      await connection.rollback();
      return { changed: false, previous };
    }

    // delivered_at is stamped once, on the transition in. It is what the
    // returns window is measured from, so a re-save must not move it and a
    // later status change must not clear it.
    await connection.execute<ResultSetHeader>(
      `UPDATE orders
          SET status = ?, tracking_id = ?,
              delivered_at = CASE
                WHEN ? = 'delivered' AND delivered_at IS NULL THEN NOW()
                ELSE delivered_at
              END
        WHERE id = ?`,
      [params.status, nextTracking, params.status, params.orderId],
    );

    await connection.execute<ResultSetHeader>(
      `INSERT INTO order_status_history (order_id, from_status, to_status, note, actor)
       VALUES (?, ?, ?, ?, ?)`,
      [
        params.orderId,
        previous,
        params.status,
        nextTracking ? `Tracking: ${nextTracking}` : null,
        params.actor,
      ],
    );

    await connection.commit();
    return { changed: statusChanged, previous };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export interface StockRow {
  variantId: number;
  sku: string;
  productName: string;
  productSlug: string;
  packSizeLabel: string;
  stockQty: number;
  lowStockThreshold: number;
  pricePaise: number;
  isLow: boolean;
}

interface StockDbRow extends RowDataPacket {
  id: number;
  sku: string;
  product_name: string;
  product_slug: string;
  pack_size_label: string;
  stock_qty: number;
  low_stock_threshold: number;
  price_inr: number;
}

export async function listStock(): Promise<StockRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<StockDbRow[]>(
    `SELECT v.id, v.sku, v.pack_size_label, v.stock_qty, v.low_stock_threshold,
            v.price_inr, p.name AS product_name, p.slug AS product_slug
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.is_active = 1
      ORDER BY p.id, v.sort_order`,
  );

  return rows.map((row) => ({
    variantId: row.id,
    sku: row.sku,
    productName: row.product_name,
    productSlug: row.product_slug,
    packSizeLabel: row.pack_size_label,
    stockQty: row.stock_qty,
    lowStockThreshold: row.low_stock_threshold,
    pricePaise: row.price_inr,
    isLow: row.stock_qty <= row.low_stock_threshold,
  }));
}

export interface StockUpdate {
  updated: boolean;
  /** What it was before. Null when the variant does not exist. */
  previous: number | null;
  next: number;
}

/**
 * Sets stock and reports what it was.
 *
 * The previous value is the point: it is what tells the caller a pack has
 * crossed from nothing to something, which is the only moment the
 * back-in-stock queue should be woken. Read under FOR UPDATE inside the
 * transaction that writes, because reading it separately would let two
 * concurrent edits both believe they were the restock and mail the queue
 * twice.
 */
export async function setVariantStock(
  variantId: number,
  stockQty: number,
): Promise<StockUpdate> {
  const pool = getPool();
  const connection = await pool.getConnection();
  const next = Math.max(0, Math.floor(stockQty));

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT stock_qty FROM product_variants WHERE id = ? FOR UPDATE`,
      [variantId],
    );
    const current = rows[0];
    if (!current) {
      await connection.rollback();
      return { updated: false, previous: null, next };
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE product_variants SET stock_qty = ? WHERE id = ?`,
      [next, variantId],
    );

    await connection.commit();
    return { updated: true, previous: Number(current.stock_qty), next };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
