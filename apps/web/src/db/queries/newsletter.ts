import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * Newsletter, double opt-in.
 *
 * Anyone can type anyone's address into a form, so typing one means
 * nothing until the person holding that inbox clicks a link. That is the
 * whole reason double opt-in exists, and it is why a `pending` row is
 * never sent anything except the one confirmation request.
 *
 * The token in that link is a bearer credential — whoever holds it can
 * confirm or unsubscribe the address — so only its SHA-256 is stored.
 * Someone reading a database backup gets hashes, not working links.
 */

export type SubscribeOutcome =
  | { outcome: "confirmation_sent"; token: string }
  | { outcome: "already_confirmed" };

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Registers interest and returns the token to email, or reports that the
 * address is already confirmed.
 *
 * The caller must respond identically either way. Saying "you are already
 * subscribed" to one address and "check your email" to another turns this
 * endpoint into an oracle for whether a given person reads this newsletter.
 */
export async function subscribe(email: string): Promise<SubscribeOutcome> {
  const pool = getPool();
  const normalised = email.trim().toLowerCase();

  const [existing] = await pool.execute<RowDataPacket[]>(
    `SELECT id, status FROM newsletter_subscribers WHERE email = ?`,
    [normalised],
  );

  if (existing[0]?.status === "confirmed") {
    return { outcome: "already_confirmed" };
  }

  const token = randomBytes(32).toString("hex");

  // A repeat request issues a fresh token and resets the clock, so someone
  // who lost the first email is not stuck. The old token stops working the
  // moment this row is updated, which is the point of storing only one.
  await pool.execute<ResultSetHeader>(
    `INSERT INTO newsletter_subscribers (email, token_hash, status)
     VALUES (?, ?, 'pending')
     ON DUPLICATE KEY UPDATE
       token_hash = VALUES(token_hash),
       token_issued_at = NOW(),
       status = 'pending',
       unsubscribed_at = NULL`,
    [normalised, hashToken(token)],
  );

  return { outcome: "confirmation_sent", token };
}

export type ConfirmOutcome = "confirmed" | "already_confirmed" | "unknown";

export async function confirmSubscription(
  token: string,
): Promise<ConfirmOutcome> {
  const pool = getPool();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, status FROM newsletter_subscribers WHERE token_hash = ?`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return "unknown";
  if (row.status === "confirmed") return "already_confirmed";

  await pool.execute<ResultSetHeader>(
    `UPDATE newsletter_subscribers
        SET status = 'confirmed', confirmed_at = NOW(), unsubscribed_at = NULL
      WHERE id = ?`,
    [row.id],
  );
  return "confirmed";
}

/**
 * Unsubscribing takes the same token the confirmation used, so the link at
 * the bottom of every issue needs no login and no lookup form. Article
 * 7(3) of the GDPR requires withdrawal to be as easy as consent was, and
 * one click each way is the only reading of that which survives contact
 * with a real person.
 */
export async function unsubscribe(token: string): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE newsletter_subscribers
        SET status = 'unsubscribed', unsubscribed_at = NOW()
      WHERE token_hash = ? AND status <> 'unsubscribed'`,
    [hashToken(token)],
  );
  return result.affectedRows > 0;
}

export interface NewsletterCounts {
  pending: number;
  confirmed: number;
  unsubscribed: number;
}

export async function countSubscribers(): Promise<NewsletterCounts> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT status, COUNT(*) n FROM newsletter_subscribers GROUP BY status`,
  );
  const counts: NewsletterCounts = {
    pending: 0,
    confirmed: 0,
    unsubscribed: 0,
  };
  for (const row of rows) {
    counts[row.status as keyof NewsletterCounts] = Number(row.n);
  }
  return counts;
}

/** DPDP erasure: the address goes, outright. It is not a financial record. */
export async function deleteSubscriber(email: string): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `DELETE FROM newsletter_subscribers WHERE email = ?`,
    [email.trim().toLowerCase()],
  );
  return result.affectedRows;
}
