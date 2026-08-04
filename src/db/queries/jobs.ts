import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/** Orders awaiting payment for over an hour that have never been chased. */
export async function findAbandonedOrderIds(
  limit = 50,
): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM orders
      WHERE payment_status = 'pending'
        AND payment_method = 'razorpay'
        AND status = 'pending'
        AND reminder_sent_at IS NULL
        AND created_at < NOW() - INTERVAL 1 HOUR
        AND created_at > NOW() - INTERVAL 48 HOUR
      ORDER BY created_at
      LIMIT ${Math.min(Math.max(Math.floor(limit), 1), 200)}`,
  );
  return rows.map((row) => row.id as string);
}

/**
 * Claims an order for reminding. The WHERE guard makes this atomic: two
 * overlapping job runs cannot both win, so a customer cannot be emailed
 * twice even if the scheduler double-fires.
 */
export async function claimReminder(orderId: string): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE orders SET reminder_sent_at = NOW()
      WHERE id = ? AND reminder_sent_at IS NULL`,
    [orderId],
  );
  return result.affectedRows === 1;
}

/** Releases the claim if the send failed, so a later run may retry. */
export async function releaseReminder(orderId: string): Promise<void> {
  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE orders SET reminder_sent_at = NULL WHERE id = ?`,
    [orderId],
  );
}

export interface StaleCancellation {
  orderId: string;
  restored: { sku: string; qty: number }[];
}

/**
 * Cancels orders left unpaid for more than 48 hours and puts their stock
 * back. Each order is handled in its own transaction so one bad row
 * cannot block the rest of the sweep.
 */
export async function cancelStaleOrders(
  olderThanHours = 48,
): Promise<StaleCancellation[]> {
  const pool = getPool();
  const hours = Math.min(Math.max(Math.floor(olderThanHours), 1), 720);

  const [candidates] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM orders
      WHERE payment_status = 'pending'
        AND status = 'pending'
        AND created_at < NOW() - INTERVAL ${hours} HOUR
      ORDER BY created_at
      LIMIT 200`,
  );

  const cancelled: StaleCancellation[] = [];

  for (const candidate of candidates) {
    const orderId = candidate.id as string;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Re-check under lock: the customer may have paid in the meantime.
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT status, payment_status FROM orders WHERE id = ? FOR UPDATE`,
        [orderId],
      );
      const order = rows[0];
      if (
        !order ||
        order.status !== "pending" ||
        order.payment_status !== "pending"
      ) {
        await connection.rollback();
        continue;
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
        `UPDATE orders SET status = 'cancelled', payment_status = 'failed'
          WHERE id = ?`,
        [orderId],
      );

      await connection.execute<ResultSetHeader>(
        `INSERT INTO order_status_history
           (order_id, from_status, to_status, note, actor)
         VALUES (?, 'pending', 'cancelled', ?, 'job:cancel-stale-orders')`,
        [orderId, `Unpaid for over ${hours}h; stock restored`],
      );

      await connection.commit();
      cancelled.push({ orderId, restored });
    } catch (error) {
      await connection.rollback();
      console.error(`[jobs] failed to cancel ${orderId}:`, error);
    } finally {
      connection.release();
    }
  }

  return cancelled;
}
