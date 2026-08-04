import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

export type EmailStatus = "sent" | "failed" | "skipped_no_smtp";

export async function logEmail(entry: {
  orderId: string | null;
  template: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  error: string | null;
}): Promise<void> {
  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `INSERT INTO email_log (order_id, template, recipient, subject, status, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entry.orderId,
      entry.template,
      entry.recipient,
      entry.subject,
      entry.status,
      entry.error?.slice(0, 500) ?? null,
    ],
  );
}

/**
 * Dedupe guard for jobs: has this template already been attempted for
 * this order? Counts skipped/failed too, so a broken SMTP config cannot
 * cause an hourly job to spam the same customer once it is fixed.
 */
export async function hasEmailBeenSent(
  orderId: string,
  template: string,
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM email_log WHERE order_id = ? AND template = ? LIMIT 1`,
    [orderId, template],
  );
  return rows.length > 0;
}
