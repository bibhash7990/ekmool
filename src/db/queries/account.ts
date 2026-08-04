import "server-only";
import type { RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";
import type { OrderStatus } from "@/db/queries/orders";

export interface AccountOrderSummary {
  id: string;
  status: OrderStatus;
  totalPaise: number;
  itemCount: number;
  createdAt: Date;
}

interface Row extends RowDataPacket {
  id: string;
  status: OrderStatus;
  total_paise: number;
  item_count: number;
  created_at: Date;
}

/**
 * Order history for a signed-in customer, matched on the email they used
 * at checkout. Callers must pass a VERIFIED address from the auth
 * provider — never one supplied by the request.
 */
export async function listOrdersByEmail(
  email: string,
): Promise<AccountOrderSummary[]> {
  if (!email) return [];

  const pool = getPool();
  const [rows] = await pool.execute<Row[]>(
    `SELECT o.id, o.status, o.total_paise, o.created_at,
            (SELECT COALESCE(SUM(qty), 0) FROM order_items i
              WHERE i.order_id = o.id) AS item_count
       FROM orders o
      WHERE o.customer_email = ?
      ORDER BY o.created_at DESC
      LIMIT 50`,
    [email.toLowerCase()],
  );

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    totalPaise: row.total_paise,
    itemCount: Number(row.item_count),
    createdAt: row.created_at,
  }));
}
