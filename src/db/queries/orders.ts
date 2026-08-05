import "server-only";
import { ulid } from "ulidx";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/db/pool";
import { upsertCustomerTx } from "@/db/queries/customers";
import { timingSafeEquals } from "@/lib/crypto";
import type { CheckoutInput } from "@/lib/validation/checkout";
import {
  FLAT_SHIPPING_PAISE,
  FREE_SHIPPING_THRESHOLD_PAISE,
} from "@/lib/constants";

export type { OrderStatus, PaymentStatus } from "@/lib/order-status";
import type { OrderStatus, PaymentStatus } from "@/lib/order-status";

export interface OrderItem {
  sku: string;
  productSlug: string;
  productName: string;
  packSizeLabel: string;
  unitPricePaise: number;
  qty: number;
  lineTotalPaise: number;
}

export interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: {
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
    landmark: string | null;
  };
  paymentMethod: "cod" | "razorpay";
  paymentStatus: PaymentStatus;
  razorpayOrderId: string | null;
  subtotalPaise: number;
  shippingPaise: number;
  totalPaise: number;
  status: OrderStatus;
  trackingId: string | null;
  createdAt: Date;
  items: OrderItem[];
}

/** Thrown when a variant cannot satisfy the requested quantity. */
export class InsufficientStockError extends Error {
  constructor(public readonly sku: string, public readonly available: number) {
    super(`Insufficient stock for ${sku}`);
    this.name = "InsufficientStockError";
  }
}

export class UnknownVariantError extends Error {
  constructor(public readonly variantId: number) {
    super(`Unknown or inactive variant ${variantId}`);
    this.name = "UnknownVariantError";
  }
}

export function shippingFor(subtotalPaise: number): number {
  return subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE
    ? 0
    : FLAT_SHIPPING_PAISE;
}

interface VariantPriceRow extends RowDataPacket {
  id: number;
  sku: string;
  pack_size_label: string;
  price_inr: number;
  product_slug: string;
  product_name: string;
}

/**
 * Creates an order inside a single transaction:
 *   1. lock + read authoritative prices from the DB (never trust the client)
 *   2. atomically decrement stock, failing the whole order on any shortfall
 *   3. insert the order, its item snapshots, and the opening status row
 *
 * Idempotency is enforced by the unique index on orders.idempotency_key:
 * a replay hits ER_DUP_ENTRY and the caller returns the original order.
 */
export async function createOrder(input: {
  idempotencyKey: string;
  checkout: CheckoutInput;
}): Promise<Order> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const variantIds = input.checkout.items.map((i) => i.variantId);
    const placeholders = variantIds.map(() => "?").join(",");

    const [variantRows] = await connection.query<VariantPriceRow[]>(
      `SELECT v.id, v.sku, v.pack_size_label, v.price_inr,
              p.slug AS product_slug, p.name AS product_name
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
        WHERE v.id IN (${placeholders})
          AND v.is_active = 1
          AND p.is_active = 1
        FOR UPDATE`,
      variantIds,
    );

    const byId = new Map(variantRows.map((row) => [row.id, row]));

    const items: OrderItem[] = [];
    for (const requested of input.checkout.items) {
      const variant = byId.get(requested.variantId);
      if (!variant) throw new UnknownVariantError(requested.variantId);

      // Atomic decrement: the WHERE guard is what prevents overselling
      // under concurrency — no read-then-write race is possible.
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE product_variants
            SET stock_qty = stock_qty - ?
          WHERE id = ? AND stock_qty >= ?`,
        [requested.qty, requested.variantId, requested.qty],
      );

      if (result.affectedRows === 0) {
        const [stockRows] = await connection.query<RowDataPacket[]>(
          `SELECT stock_qty FROM product_variants WHERE id = ?`,
          [requested.variantId],
        );
        throw new InsufficientStockError(
          variant.sku,
          Number(stockRows[0]?.stock_qty ?? 0),
        );
      }

      items.push({
        sku: variant.sku,
        productSlug: variant.product_slug,
        productName: variant.product_name,
        packSizeLabel: variant.pack_size_label,
        unitPricePaise: variant.price_inr,
        qty: requested.qty,
        lineTotalPaise: variant.price_inr * requested.qty,
      });
    }

    const subtotalPaise = items.reduce((sum, i) => sum + i.lineTotalPaise, 0);
    const shippingPaise = shippingFor(subtotalPaise);
    const totalPaise = subtotalPaise + shippingPaise;

    const orderId = ulid();
    const { customer, address, paymentMethod, notes } = input.checkout;

    // COD is confirmed on placement; online payment waits for the webhook.
    const status: OrderStatus = paymentMethod === "cod" ? "confirmed" : "pending";

    // The customer record is created here, implicitly, and only here. Nobody
    // is asked to register. Deliberately after the variant locks so every
    // transaction takes the same locks in the same order.
    const customerId = await upsertCustomerTx(connection, customer);

    await connection.execute<ResultSetHeader>(
      `INSERT INTO orders
         (id, customer_id, idempotency_key, customer_name, customer_email,
          customer_phone, address_line1, address_line2, address_city,
          address_state, address_pincode, address_landmark, payment_method,
          payment_status, subtotal_paise, shipping_paise, total_paise,
          status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [
        orderId,
        customerId,
        input.idempotencyKey,
        customer.name,
        customer.email.toLowerCase(),
        customer.phone,
        address.line1,
        address.line2 || null,
        address.city,
        address.state,
        address.pincode,
        address.landmark || null,
        paymentMethod,
        subtotalPaise,
        shippingPaise,
        totalPaise,
        status,
        notes || null,
      ],
    );

    for (const item of items) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO order_items
           (order_id, variant_id, sku, product_slug, product_name,
            pack_size_label, unit_price_paise, qty, line_total_paise)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          input.checkout.items.find(
            (i) => byId.get(i.variantId)?.sku === item.sku,
          )?.variantId ?? null,
          item.sku,
          item.productSlug,
          item.productName,
          item.packSizeLabel,
          item.unitPricePaise,
          item.qty,
          item.lineTotalPaise,
        ],
      );
    }

    await recordStatus(connection, orderId, null, status, "Order placed");

    await connection.commit();

    return {
      id: orderId,
      customerName: customer.name,
      customerEmail: customer.email.toLowerCase(),
      customerPhone: customer.phone,
      address: {
        line1: address.line1,
        line2: address.line2 || null,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        landmark: address.landmark || null,
      },
      paymentMethod,
      paymentStatus: "pending",
      razorpayOrderId: null,
      subtotalPaise,
      shippingPaise,
      totalPaise,
      status,
      trackingId: null,
      createdAt: new Date(),
      items,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recordStatus(
  connection: PoolConnection,
  orderId: string,
  from: string | null,
  to: string,
  note: string,
  actor = "system",
): Promise<void> {
  await connection.execute<ResultSetHeader>(
    `INSERT INTO order_status_history (order_id, from_status, to_status, note, actor)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, from, to, note, actor],
  );
}

interface OrderRow extends RowDataPacket {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_line1: string;
  address_line2: string | null;
  address_city: string;
  address_state: string;
  address_pincode: string;
  address_landmark: string | null;
  payment_method: "cod" | "razorpay";
  payment_status: PaymentStatus;
  razorpay_order_id: string | null;
  subtotal_paise: number;
  shipping_paise: number;
  total_paise: number;
  status: OrderStatus;
  tracking_id: string | null;
  created_at: Date;
}

interface OrderItemRow extends RowDataPacket {
  sku: string;
  product_slug: string;
  product_name: string;
  pack_size_label: string;
  unit_price_paise: number;
  qty: number;
  line_total_paise: number;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const pool = getPool();
  const [rows] = await pool.execute<OrderRow[]>(
    `SELECT * FROM orders WHERE id = ?`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const [itemRows] = await pool.execute<OrderItemRow[]>(
    `SELECT sku, product_slug, product_name, pack_size_label,
            unit_price_paise, qty, line_total_paise
       FROM order_items WHERE order_id = ? ORDER BY id`,
    [id],
  );

  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    address: {
      line1: row.address_line1,
      line2: row.address_line2,
      city: row.address_city,
      state: row.address_state,
      pincode: row.address_pincode,
      landmark: row.address_landmark,
    },
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    razorpayOrderId: row.razorpay_order_id,
    subtotalPaise: row.subtotal_paise,
    shippingPaise: row.shipping_paise,
    totalPaise: row.total_paise,
    status: row.status,
    trackingId: row.tracking_id,
    createdAt: row.created_at,
    items: itemRows.map((i) => ({
      sku: i.sku,
      productSlug: i.product_slug,
      productName: i.product_name,
      packSizeLabel: i.pack_size_label,
      unitPricePaise: i.unit_price_paise,
      qty: i.qty,
      lineTotalPaise: i.line_total_paise,
    })),
  };
}

export async function getOrderByIdempotencyKey(
  key: string,
): Promise<Order | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM orders WHERE idempotency_key = ?`,
    [key],
  );
  const id = rows[0]?.id as string | undefined;
  return id ? getOrderById(id) : null;
}

export async function attachRazorpayOrderId(
  orderId: string,
  razorpayOrderId: string,
): Promise<void> {
  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE orders SET razorpay_order_id = ? WHERE id = ?`,
    [razorpayOrderId, orderId],
  );
}

/**
 * Marks an order paid. Idempotent by construction: the unique index on
 * razorpay_payment_id means a webhook replay updates zero rows, and the
 * caller can treat that as "already handled".
 *
 * Returns true only for the transition that actually happened.
 */
export async function markOrderPaid(
  razorpayOrderId: string,
  razorpayPaymentId: string,
): Promise<{ transitioned: boolean; orderId: string | null }> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, status, payment_status FROM orders
        WHERE razorpay_order_id = ? FOR UPDATE`,
      [razorpayOrderId],
    );
    const order = rows[0];
    if (!order) {
      await connection.rollback();
      return { transitioned: false, orderId: null };
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE orders
          SET payment_status = 'paid',
              razorpay_payment_id = ?,
              status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END
        WHERE id = ? AND payment_status <> 'paid'`,
      [razorpayPaymentId, order.id],
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return { transitioned: false, orderId: order.id as string };
    }

    await recordStatus(
      connection,
      order.id as string,
      order.status as string,
      "confirmed",
      `Payment captured (${razorpayPaymentId})`,
      "razorpay-webhook",
    );

    await connection.commit();
    return { transitioned: true, orderId: order.id as string };
  } catch (error) {
    await connection.rollback();
    // A duplicate razorpay_payment_id means another delivery of the same
    // webhook won the race. That is success, not failure.
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    ) {
      return { transitioned: false, orderId: null };
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function markPaymentFailed(
  razorpayOrderId: string,
): Promise<void> {
  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE orders SET payment_status = 'failed'
      WHERE razorpay_order_id = ? AND payment_status = 'pending'`,
    [razorpayOrderId],
  );
}

export interface OrderTimelineEntry {
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actor: string;
  createdAt: Date;
}

/**
 * Everything that has happened to an order, oldest first. This table has
 * been written on every transition since day one — placement, payment
 * capture, admin updates, the stale-order job — so the customer-facing
 * timeline needs no new schema and cannot drift from the truth.
 */
export async function getOrderTimeline(
  orderId: string,
): Promise<OrderTimelineEntry[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT from_status, to_status, note, actor, created_at
       FROM order_status_history
      WHERE order_id = ?
      ORDER BY created_at, id`,
    [orderId],
  );

  return rows.map((row) => ({
    fromStatus: row.from_status as string | null,
    toStatus: row.to_status as string,
    note: row.note as string | null,
    actor: row.actor as string,
    createdAt: row.created_at as Date,
  }));
}

/**
 * Candidate orders for a quoted eight-character reference. Returns the
 * email so the caller can compare it in constant time — the comparison is
 * deliberately not done here, because the caller must answer identically
 * whether the reference or the email was wrong.
 *
 * Indexed by the generated order_ref column; the LIMIT is belt-and-braces
 * against an improbable collision, not an expected case.
 */
export async function findOrdersByRef(
  ref: string,
): Promise<{ id: string; email: string }[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, customer_email FROM orders
      WHERE order_ref = ?
      ORDER BY created_at DESC
      LIMIT 5`,
    [ref.toUpperCase()],
  );
  return rows.map((row) => ({
    id: row.id as string,
    email: row.customer_email as string,
  }));
}

export type CancelRefusal =
  | "not_found"
  | "not_yours"
  | "already_cancelled"
  | "too_late"
  | "prepaid";

export type CancelResult =
  | { ok: true; restored: { sku: string; qty: number }[] }
  | { ok: false; reason: CancelRefusal };

/** A customer may still call it off at these stages; after packing, they cannot. */
const CUSTOMER_CANCELLABLE: OrderStatus[] = ["pending", "confirmed"];

/**
 * Self-service cancellation. Mirrors cancelStaleOrders in db/queries/jobs.ts
 * exactly — same lock, same stock restoration, same history row — so there
 * is one way an order is cancelled and one way stock comes back.
 *
 * The email must already have been verified (it comes from the session
 * cookie, never from the request body).
 *
 * Prepaid orders are refused rather than cancelled. Cancelling one obliges
 * us to refund it, and there is no refund integration yet; silently marking
 * it cancelled while the customer's money sits with us would be worse than
 * asking them to contact us.
 */
export async function cancelOrderByCustomer(
  orderId: string,
  verifiedEmail: string,
): Promise<CancelResult> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT status, payment_status, customer_email
         FROM orders WHERE id = ? FOR UPDATE`,
      [orderId],
    );
    const order = rows[0];

    if (!order) {
      await connection.rollback();
      return { ok: false, reason: "not_found" };
    }

    if (
      !timingSafeEquals(
        String(order.customer_email).toLowerCase(),
        verifiedEmail.toLowerCase(),
      )
    ) {
      await connection.rollback();
      return { ok: false, reason: "not_yours" };
    }

    const status = order.status as OrderStatus;
    if (status === "cancelled") {
      await connection.rollback();
      return { ok: false, reason: "already_cancelled" };
    }
    if (!CUSTOMER_CANCELLABLE.includes(status)) {
      await connection.rollback();
      return { ok: false, reason: "too_late" };
    }
    if (order.payment_status === "paid") {
      await connection.rollback();
      return { ok: false, reason: "prepaid" };
    }

    const [items] = await connection.execute<RowDataPacket[]>(
      `SELECT variant_id, sku, qty FROM order_items WHERE order_id = ?`,
      [orderId],
    );

    const restored: { sku: string; qty: number }[] = [];
    for (const item of items) {
      if (item.variant_id === null) continue;
      await connection.execute<ResultSetHeader>(
        `UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?`,
        [item.qty, item.variant_id],
      );
      restored.push({ sku: item.sku as string, qty: Number(item.qty) });
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE orders SET status = 'cancelled' WHERE id = ?`,
      [orderId],
    );

    await recordStatus(
      connection,
      orderId,
      status,
      "cancelled",
      "Cancelled by customer; stock restored",
      "customer",
    );

    await connection.commit();
    return { ok: true, restored };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
