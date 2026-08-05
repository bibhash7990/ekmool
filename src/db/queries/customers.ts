import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/db/pool";

/**
 * Customers are never registered. A row appears the first time someone
 * checks out, created by the upsert below inside the order transaction, and
 * the customer is never asked for a password or told an account exists.
 *
 * Identity is the email address, lowercased on write so the unique index is
 * a real constraint rather than a collation coincidence.
 */

export interface Customer {
  id: number;
  email: string;
  name: string;
  phone: string;
  marketingOptIn: boolean;
  createdAt: Date;
}

interface CustomerRow extends RowDataPacket {
  id: number;
  email: string;
  name: string;
  phone: string;
  marketing_opt_in: number;
  created_at: Date;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    marketingOptIn: row.marketing_opt_in === 1,
    createdAt: row.created_at,
  };
}

/**
 * Creates or refreshes the customer behind an order, returning its id.
 *
 * Runs on the caller's connection so it shares the order transaction: if the
 * order rolls back, so does this. Name and phone are overwritten because the
 * newest checkout is the freshest thing the customer has told us.
 * marketing_opt_in deliberately is not — placing an order is not consent,
 * and only the customer may change that.
 */
export async function upsertCustomerTx(
  connection: PoolConnection,
  customer: { email: string; name: string; phone: string },
): Promise<number> {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO customers (email, name, phone)
     VALUES (?, ?, ?) AS incoming
     ON DUPLICATE KEY UPDATE
       name  = incoming.name,
       phone = incoming.phone,
       id    = LAST_INSERT_ID(id)`,
    [customer.email.toLowerCase(), customer.name, customer.phone],
  );
  return result.insertId;
}

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
  if (!email) return null;
  const pool = getPool();
  const [rows] = await pool.execute<CustomerRow[]>(
    `SELECT id, email, name, phone, marketing_opt_in, created_at
       FROM customers WHERE email = ?`,
    [email.toLowerCase()],
  );
  const row = rows[0];
  return row ? toCustomer(row) : null;
}
