import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * Reports.
 *
 * Two decisions run through this file, and both of them change the numbers.
 *
 * **Days are Indian days.** orders.created_at is a TIMESTAMP, which MySQL
 * stores as UTC and hands back in the session time zone — UTC in the Docker
 * image. Grouping on that directly would put every order placed between
 * midnight and 05:30 IST on the previous day, so a report of "yesterday"
 * would be missing a slice of it and "today" would carry a slice it should
 * not. The expression below shifts to IST from whatever the session is
 * actually set to, rather than assuming UTC.
 *
 * **Ordered is not received.** In a COD-heavy market these are different
 * numbers and conflating them is how a shop believes it has money it has
 * not been handed. `gross` is what customers have ordered, cancellations
 * excluded. `realised` is what has actually been collected: prepaid orders
 * marked paid, and COD orders that have been delivered. Everything between
 * those two figures is a parcel in transit.
 */

/**
 * Shift a TIMESTAMP column into IST regardless of the session time zone.
 *
 * CONVERT_TZ would be the obvious tool and is the wrong one here: it needs
 * the named time-zone tables loaded (`mysql_tzinfo_to_sql`), which the
 * official image does not ship, and it returns NULL when they are missing
 * — a silently empty report rather than an error. The offset arithmetic
 * needs nothing loaded and cannot fail that way.
 */
const IST = (column: string) =>
  `(${column} + INTERVAL (19800 - TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())) SECOND)`;

function clampDays(days: number): number {
  return Math.min(Math.max(Math.floor(days), 1), 730);
}

export interface SalesSummary {
  days: number;
  orders: number;
  cancelled: number;
  /** Ordered, cancellations excluded. */
  grossPaise: number;
  /** Actually collected: prepaid and paid, or COD and delivered. */
  realisedPaise: number;
  averageOrderPaise: number;
  discountPaise: number;
  shippingPaise: number;
  /** CGST + SGST + IGST across the lines. Zero until a GSTIN is configured. */
  taxPaise: number;
  units: number;
  codOrders: number;
  prepaidOrders: number;
}

export async function getSalesSummary(days = 30): Promise<SalesSummary> {
  const pool = getPool();
  const window = clampDays(days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS orders,
       SUM(o.status = 'cancelled') AS cancelled,
       COALESCE(SUM(CASE WHEN o.status <> 'cancelled'
                         THEN o.total_paise ELSE 0 END), 0) AS gross,
       COALESCE(SUM(CASE WHEN o.status <> 'cancelled'
                          AND (o.payment_status = 'paid'
                               OR (o.payment_method = 'cod'
                                   AND o.status = 'delivered'))
                         THEN o.total_paise ELSE 0 END), 0) AS realised,
       COALESCE(SUM(CASE WHEN o.status <> 'cancelled'
                         THEN o.discount_paise ELSE 0 END), 0) AS discount,
       COALESCE(SUM(CASE WHEN o.status <> 'cancelled'
                         THEN o.shipping_paise ELSE 0 END), 0) AS shipping,
       SUM(o.payment_method = 'cod' AND o.status <> 'cancelled') AS cod,
       SUM(o.payment_method = 'razorpay' AND o.status <> 'cancelled') AS prepaid
     FROM orders o
    WHERE o.created_at >= NOW() - INTERVAL ${window} DAY`,
  );

  // Tax and units come from the lines, so they are their own query rather
  // than a join that would multiply the order-level sums by the line count.
  const [lineRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(i.qty), 0) AS units,
            COALESCE(SUM(i.cgst_paise + i.sgst_paise + i.igst_paise), 0) AS tax
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
      WHERE o.created_at >= NOW() - INTERVAL ${window} DAY
        AND o.status <> 'cancelled'`,
  );

  const row = rows[0] ?? {};
  const lines = lineRows[0] ?? {};
  const orders = Number(row.orders ?? 0);
  const cancelled = Number(row.cancelled ?? 0);
  const grossPaise = Number(row.gross ?? 0);
  const live = orders - cancelled;

  return {
    days: window,
    orders,
    cancelled,
    grossPaise,
    realisedPaise: Number(row.realised ?? 0),
    averageOrderPaise: live > 0 ? Math.round(grossPaise / live) : 0,
    discountPaise: Number(row.discount ?? 0),
    shippingPaise: Number(row.shipping ?? 0),
    taxPaise: Number(lines.tax ?? 0),
    units: Number(lines.units ?? 0),
    codOrders: Number(row.cod ?? 0),
    prepaidOrders: Number(row.prepaid ?? 0),
  };
}

export interface RevenueDay {
  /** ISO date, in IST. */
  day: string;
  orders: number;
  grossPaise: number;
}

export async function getRevenueByDay(days = 30): Promise<RevenueDay[]> {
  const pool = getPool();
  const window = clampDays(days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DATE(${IST("o.created_at")}) AS day,
            COUNT(*) AS orders,
            COALESCE(SUM(o.total_paise), 0) AS gross
       FROM orders o
      WHERE o.created_at >= NOW() - INTERVAL ${window} DAY
        AND o.status <> 'cancelled'
      GROUP BY day
      ORDER BY day`,
  );

  return rows.map((row) => ({
    // DATE() comes back as a JS Date with dateStrings off. Sliced rather
    // than formatted so the value is a plain calendar day with no timezone
    // to be re-interpreted by whatever reads it next.
    day:
      row.day instanceof Date
        ? row.day.toISOString().slice(0, 10)
        : String(row.day),
    orders: Number(row.orders),
    grossPaise: Number(row.gross),
  }));
}

export interface TopProduct {
  productSlug: string;
  productName: string;
  units: number;
  revenuePaise: number;
  orders: number;
}

/**
 * Grouped on the slug snapshotted onto the line, not on a join to products.
 * A product that has since been archived still sold what it sold, and a
 * report that quietly drops it is a report that does not add up to the
 * revenue figure above it.
 */
export async function getTopProducts(
  days = 30,
  limit = 20,
): Promise<TopProduct[]> {
  const pool = getPool();
  const window = clampDays(days);
  const capped = Math.min(Math.max(Math.floor(limit), 1), 100);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT i.product_slug,
            MAX(i.product_name) AS product_name,
            SUM(i.qty) AS units,
            SUM(i.line_total_paise - i.discount_paise) AS revenue,
            COUNT(DISTINCT i.order_id) AS orders
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
      WHERE o.created_at >= NOW() - INTERVAL ${window} DAY
        AND o.status <> 'cancelled'
      GROUP BY i.product_slug
      ORDER BY revenue DESC
      LIMIT ${capped}`,
  );

  return rows.map((row) => ({
    productSlug: row.product_slug as string,
    productName: row.product_name as string,
    units: Number(row.units),
    revenuePaise: Number(row.revenue),
    orders: Number(row.orders),
  }));
}

export interface FunnelStage {
  status: string;
  count: number;
  valuePaise: number;
}

/**
 * Where orders currently sit. Not a conversion funnel — there is no
 * analytics data here to build one from, and inventing "views → carts"
 * numbers out of order rows would be a chart that lies. This is the
 * operational question the owner actually has: what is waiting on me.
 */
export async function getOrderFunnel(days = 30): Promise<FunnelStage[]> {
  const pool = getPool();
  const window = clampDays(days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT o.status, COUNT(*) AS n, COALESCE(SUM(o.total_paise), 0) AS value
       FROM orders o
      WHERE o.created_at >= NOW() - INTERVAL ${window} DAY
      GROUP BY o.status`,
  );

  return rows.map((row) => ({
    status: row.status as string,
    count: Number(row.n),
    valuePaise: Number(row.value),
  }));
}

export interface LowStockRow {
  variantId: number;
  sku: string;
  productName: string;
  packSizeLabel: string;
  stockQty: number;
  lowStockThreshold: number;
  /** Units sold in the last 30 days — how fast this is actually moving. */
  soldLast30: number;
  waitingCustomers: number;
}

/**
 * What to reorder, and how urgent it is.
 *
 * The threshold alone does not say that: eight left is comfortable for a
 * pack that sells one a month and an emergency for one that sells thirty.
 * So the recent sales rate travels with it, and so does the number of
 * people who have asked to be told when it is back — the clearest demand
 * signal the shop has, and the one that is embarrassing to ignore.
 */
export async function getLowStock(): Promise<LowStockRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT v.id, v.sku, v.pack_size_label, v.stock_qty, v.low_stock_threshold,
            p.name AS product_name,
            (SELECT COALESCE(SUM(i.qty), 0)
               FROM order_items i
               JOIN orders o ON o.id = i.order_id
              WHERE i.variant_id = v.id
                AND o.status <> 'cancelled'
                AND o.created_at >= NOW() - INTERVAL 30 DAY) AS sold_last_30,
            (SELECT COUNT(*) FROM back_in_stock_requests b
              WHERE b.variant_id = v.id AND b.notified_at IS NULL)
              AS waiting
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.is_active = 1 AND p.is_active = 1
        AND v.stock_qty <= v.low_stock_threshold
      ORDER BY v.stock_qty, p.name`,
  );

  return rows.map((row) => ({
    variantId: Number(row.id),
    sku: row.sku as string,
    productName: row.product_name as string,
    packSizeLabel: row.pack_size_label as string,
    stockQty: Number(row.stock_qty),
    lowStockThreshold: Number(row.low_stock_threshold),
    soldLast30: Number(row.sold_last_30),
    waitingCustomers: Number(row.waiting),
  }));
}

export interface CustomerRow {
  id: number;
  email: string;
  name: string;
  phone: string;
  marketingOptIn: boolean;
  orders: number;
  spentPaise: number;
  lastOrderAt: Date | null;
  createdAt: Date;
}

/**
 * The customer list.
 *
 * Orders and spend are counted from the orders table rather than kept as a
 * running total on the customer row, so a cancelled order stops counting
 * the moment it is cancelled without anything having to remember to
 * decrement it.
 *
 * An erased customer (DPDP) keeps a row with anonymised fields, because the
 * orders behind it are financial records that have to survive. It will
 * appear here with an `erased+…@invalid` address, which is the honest
 * representation: somebody bought something, and we no longer know who.
 */
export async function listCustomersForAdmin(
  limit = 200,
): Promise<CustomerRow[]> {
  const pool = getPool();
  const capped = Math.min(Math.max(Math.floor(limit), 1), 1000);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.email, c.name, c.phone, c.marketing_opt_in, c.created_at,
            (SELECT COUNT(*) FROM orders o
              WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS orders,
            (SELECT COALESCE(SUM(o.total_paise), 0) FROM orders o
              WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS spent,
            (SELECT MAX(o.created_at) FROM orders o
              WHERE o.customer_id = c.id) AS last_order_at
       FROM customers c
      ORDER BY last_order_at DESC, c.id DESC
      LIMIT ${capped}`,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    email: row.email as string,
    name: row.name as string,
    phone: row.phone as string,
    marketingOptIn: row.marketing_opt_in === 1,
    orders: Number(row.orders),
    spentPaise: Number(row.spent),
    lastOrderAt: (row.last_order_at as Date | null) ?? null,
    createdAt: row.created_at as Date,
  }));
}

export interface CustomerSummary {
  total: number;
  repeat: number;
  newInWindow: number;
  marketingOptIn: number;
}

export async function getCustomerSummary(
  days = 30,
): Promise<CustomerSummary> {
  const pool = getPool();
  const window = clampDays(days);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total,
       SUM(c.created_at >= NOW() - INTERVAL ${window} DAY) AS new_in_window,
       SUM(c.marketing_opt_in = 1) AS opted_in,
       SUM((SELECT COUNT(*) FROM orders o
             WHERE o.customer_id = c.id AND o.status <> 'cancelled') > 1)
         AS repeat_buyers
     FROM customers c`,
  );

  const row = rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    repeat: Number(row.repeat_buyers ?? 0),
    newInWindow: Number(row.new_in_window ?? 0),
    marketingOptIn: Number(row.opted_in ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/* Export rows                                                         */

export interface OrderExportRow extends RowDataPacket {
  id: string;
  created_at: Date;
  status: string;
  payment_method: string;
  payment_status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_city: string;
  address_state: string;
  address_pincode: string;
  coupon_code: string | null;
  subtotal_paise: number;
  discount_paise: number;
  shipping_paise: number;
  total_paise: number;
  tax_paise: number;
  invoice_number: string | null;
  items: string;
}

/**
 * One row per order for the CSV, with the lines flattened into a single
 * cell. A spreadsheet with one row per *line* would double-count every
 * order-level total the moment anybody sums a column, which is the first
 * thing anybody does with an export.
 *
 * The lines are fetched separately and joined here rather than with
 * GROUP_CONCAT, which is the obvious way and quietly wrong: it truncates at
 * group_concat_max_len — 1024 bytes by default — with no error and no
 * warning the application can see. An export that silently drops the tail
 * of a large order is the worst kind of defect in a document somebody hands
 * to their accountant.
 */
export async function exportOrders(days = 90): Promise<OrderExportRow[]> {
  const pool = getPool();
  const window = clampDays(days);

  const [rows] = await pool.query<OrderExportRow[]>(
    `SELECT o.id, o.created_at, o.status, o.payment_method, o.payment_status,
            o.customer_name, o.customer_email, o.customer_phone,
            o.address_city, o.address_state, o.address_pincode,
            o.coupon_code, o.subtotal_paise, o.discount_paise,
            o.shipping_paise, o.total_paise, o.invoice_number,
            (SELECT COALESCE(SUM(i.cgst_paise + i.sgst_paise + i.igst_paise), 0)
               FROM order_items i WHERE i.order_id = o.id) AS tax_paise,
            '' AS items
       FROM orders o
      WHERE o.created_at >= NOW() - INTERVAL ${window} DAY
      ORDER BY o.created_at DESC`,
  );

  if (rows.length === 0) return rows;

  const [lines] = await pool.query<RowDataPacket[]>(
    `SELECT i.order_id, i.qty, i.product_name, i.pack_size_label
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
      WHERE o.created_at >= NOW() - INTERVAL ${window} DAY
      ORDER BY i.order_id, i.id`,
  );

  const byOrder = new Map<string, string[]>();
  for (const line of lines) {
    const orderId = line.order_id as string;
    const list = byOrder.get(orderId) ?? [];
    list.push(`${line.qty} x ${line.product_name} ${line.pack_size_label}`);
    byOrder.set(orderId, list);
  }

  for (const row of rows) {
    row.items = (byOrder.get(row.id) ?? []).join("; ");
  }

  return rows;
}
