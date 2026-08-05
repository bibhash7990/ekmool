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

/**
 * The customer's own edits. The email is not editable here: it is the
 * identity the session is bound to and the key their orders are matched
 * on, so changing it would mean re-verifying, not editing a field.
 */
export async function updateCustomerProfile(
  email: string,
  profile: { name: string; phone: string; marketingOptIn: boolean },
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE customers
        SET name = ?, phone = ?, marketing_opt_in = ?
      WHERE email = ?`,
    [
      profile.name,
      profile.phone,
      profile.marketingOptIn ? 1 : 0,
      email.toLowerCase(),
    ],
  );
  return result.affectedRows > 0;
}

/* ---------------------------------------------------------------- */
/* Saved addresses                                                    */
/*                                                                    */
/* Every function below takes customerId and includes it in the WHERE  */
/* clause even where the address id alone would be unique. That is     */
/* deliberate: it makes "you can only touch your own" a property of    */
/* the query rather than of the caller remembering to check.           */
/* ---------------------------------------------------------------- */

export interface CustomerAddress {
  id: number;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  landmark: string | null;
  isDefault: boolean;
}

export interface AddressInput {
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  landmark?: string | null;
  isDefault?: boolean;
}

/** Enough for home, work, and a few relatives. A cap stops a runaway form. */
export const MAX_ADDRESSES = 10;

interface AddressRow extends RowDataPacket {
  id: number;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  landmark: string | null;
  is_default: number;
}

function toAddress(row: AddressRow): CustomerAddress {
  return {
    id: row.id,
    label: row.label,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    landmark: row.landmark,
    isDefault: row.is_default === 1,
  };
}

export async function listAddresses(
  customerId: number,
): Promise<CustomerAddress[]> {
  const pool = getPool();
  const [rows] = await pool.execute<AddressRow[]>(
    `SELECT id, label, line1, line2, city, state, pincode, landmark, is_default
       FROM customer_addresses
      WHERE customer_id = ?
      ORDER BY is_default DESC, id`,
    [customerId],
  );
  return rows.map(toAddress);
}

/** The one checkout should prefill: the default, else the most recent. */
export async function getDefaultAddress(
  customerId: number,
): Promise<CustomerAddress | null> {
  const addresses = await listAddresses(customerId);
  return addresses[0] ?? null;
}

export class TooManyAddressesError extends Error {
  constructor() {
    super(`A customer may save at most ${MAX_ADDRESSES} addresses`);
    this.name = "TooManyAddressesError";
  }
}

/**
 * Saves an address, in one transaction with the default flag so a
 * customer can never end up with two defaults or none.
 */
export async function createAddress(
  customerId: number,
  input: AddressInput,
): Promise<number> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [counts] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM customer_addresses WHERE customer_id = ? FOR UPDATE`,
      [customerId],
    );
    const existing = Number(counts[0]?.n ?? 0);
    if (existing >= MAX_ADDRESSES) {
      await connection.rollback();
      throw new TooManyAddressesError();
    }

    // The first address saved is the default whether or not it was asked
    // for — otherwise checkout has nothing to prefill from.
    const isDefault = input.isDefault || existing === 0;
    if (isDefault) {
      await connection.execute<ResultSetHeader>(
        `UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?`,
        [customerId],
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO customer_addresses
         (customer_id, label, line1, line2, city, state, pincode, landmark, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        input.label,
        input.line1,
        input.line2 || null,
        input.city,
        input.state,
        input.pincode,
        input.landmark || null,
        isDefault ? 1 : 0,
      ],
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateAddress(
  customerId: number,
  addressId: number,
  input: AddressInput,
): Promise<boolean> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (input.isDefault) {
      await connection.execute<ResultSetHeader>(
        `UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?`,
        [customerId],
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE customer_addresses
          SET label = ?, line1 = ?, line2 = ?, city = ?, state = ?,
              pincode = ?, landmark = ?,
              is_default = CASE WHEN ? THEN 1 ELSE is_default END
        WHERE id = ? AND customer_id = ?`,
      [
        input.label,
        input.line1,
        input.line2 || null,
        input.city,
        input.state,
        input.pincode,
        input.landmark || null,
        input.isDefault ? 1 : 0,
        addressId,
        customerId,
      ],
    );

    // affectedRows is 0 for "not yours" and also for "saved with no
    // changes", so ask separately whether the row is actually theirs.
    const [owned] = await connection.execute<RowDataPacket[]>(
      `SELECT 1 FROM customer_addresses WHERE id = ? AND customer_id = ?`,
      [addressId, customerId],
    );

    await connection.commit();
    return owned.length > 0 || result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Deleting the default promotes the next address, so one always remains. */
export async function deleteAddress(
  customerId: number,
  addressId: number,
): Promise<boolean> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT is_default FROM customer_addresses
        WHERE id = ? AND customer_id = ? FOR UPDATE`,
      [addressId, customerId],
    );
    if (rows.length === 0) {
      await connection.rollback();
      return false;
    }

    await connection.execute<ResultSetHeader>(
      `DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?`,
      [addressId, customerId],
    );

    if (rows[0].is_default === 1) {
      await connection.execute<ResultSetHeader>(
        `UPDATE customer_addresses SET is_default = 1
          WHERE customer_id = ? ORDER BY id LIMIT 1`,
        [customerId],
      );
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function setDefaultAddress(
  customerId: number,
  addressId: number,
): Promise<boolean> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE customer_addresses SET is_default = 1
        WHERE id = ? AND customer_id = ?`,
      [addressId, customerId],
    );
    if (result.affectedRows === 0) {
      const [owned] = await connection.execute<RowDataPacket[]>(
        `SELECT 1 FROM customer_addresses WHERE id = ? AND customer_id = ?`,
        [addressId, customerId],
      );
      if (owned.length === 0) {
        await connection.rollback();
        return false;
      }
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE customer_addresses SET is_default = 0
        WHERE customer_id = ? AND id <> ?`,
      [customerId, addressId],
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
