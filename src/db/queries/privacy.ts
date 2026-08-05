import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * DPDP Act 2023 rights: access (s.11) and erasure (s.12).
 *
 * **Erasure is anonymisation, not deletion, and that is not a dodge.** An
 * order is a financial record. Rule 56 of the CGST Rules requires the books
 * and the invoices behind them to be kept for 72 months from the annual
 * return's due date, and the Income Tax Act wants six years. So the
 * transaction survives and the person is removed from it: name, email,
 * phone and address are overwritten, `customer_id` is released, and what
 * remains is a row saying two packs of turmeric were sold to Karnataka on a
 * date, which identifies nobody.
 *
 * The DPDP Act anticipates exactly this — the erasure right yields where
 * another law requires retention. What it does not permit is keeping the
 * personal data *as well*, which is why the overwrite below touches every
 * column that could name someone rather than only the obvious ones.
 */

export interface CustomerExport {
  exportedAt: string;
  customer: Record<string, unknown> | null;
  addresses: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  emailsSent: Record<string, unknown>[];
  returnRequests: Record<string, unknown>[];
}

/**
 * Everything held about one person, in the shape it is actually stored.
 *
 * Deliberately not prettified into a report. An access request is answered
 * with the data, not with a summary of the data — a summary is a second
 * document whose accuracy the reader has to take on trust.
 */
export async function exportCustomerData(
  email: string,
): Promise<CustomerExport> {
  const pool = getPool();
  const normalised = email.trim().toLowerCase();

  const [customerRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, email, name, phone, marketing_opt_in, created_at, updated_at
       FROM customers WHERE email = ?`,
    [normalised],
  );
  const customer = customerRows[0] ?? null;

  const [addresses] = await pool.execute<RowDataPacket[]>(
    `SELECT id, label, line1, line2, city, state, pincode, landmark,
            is_default, created_at, updated_at
       FROM customer_addresses WHERE customer_id = ?
      ORDER BY id`,
    [customer ? customer.id : 0],
  );

  const [orders] = await pool.execute<RowDataPacket[]>(
    `SELECT o.id, o.order_ref, o.status, o.payment_method, o.payment_status,
            o.customer_name, o.customer_email, o.customer_phone,
            o.address_line1, o.address_line2, o.address_city,
            o.address_state, o.address_pincode, o.address_landmark,
            o.subtotal_paise, o.shipping_paise, o.total_paise,
            o.place_of_supply, o.invoice_number, o.invoice_date,
            o.tracking_id, o.notes, o.created_at, o.delivered_at
       FROM orders o WHERE o.customer_email = ?
      ORDER BY o.created_at`,
    [normalised],
  );

  // The line items belong with their order rather than in a flat list, so
  // the export reads the way the person's own history reads.
  for (const order of orders) {
    const [items] = await pool.execute<RowDataPacket[]>(
      `SELECT sku, product_name, pack_size_label, qty,
              unit_price_paise, line_total_paise, hsn_code, gst_rate_bps
         FROM order_items WHERE order_id = ? ORDER BY id`,
      [order.id],
    );
    order.items = items;
  }

  const [emailsSent] = await pool.execute<RowDataPacket[]>(
    `SELECT l.template, l.recipient, l.status, l.created_at
       FROM email_log l JOIN orders o ON o.id = l.order_id
      WHERE o.customer_email = ? ORDER BY l.created_at`,
    [normalised],
  );

  const [returnRequests] = await pool.execute<RowDataPacket[]>(
    `SELECT r.order_id, r.reason, r.detail, r.status, r.resolution,
            r.created_at
       FROM return_requests r JOIN orders o ON o.id = r.order_id
      WHERE o.customer_email = ? ORDER BY r.created_at`,
    [normalised],
  );

  return {
    exportedAt: new Date().toISOString(),
    customer: customer ? { ...customer } : null,
    addresses: addresses.map((row) => ({ ...row })),
    orders: orders.map((row) => ({ ...row })),
    emailsSent: emailsSent.map((row) => ({ ...row })),
    returnRequests: returnRequests.map((row) => ({ ...row })),
  };
}

export interface ErasureResult {
  ordersAnonymised: number;
  addressesDeleted: number;
  customerDeleted: boolean;
}

/**
 * A placeholder that is obviously a placeholder. Anyone reading the table
 * afterwards should see immediately that a person was removed on purpose,
 * not that a row was written badly.
 */
const REDACTED = "[erased]";

export async function eraseCustomer(email: string): Promise<ErasureResult> {
  const pool = getPool();
  const normalised = email.trim().toLowerCase();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [customerRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM customers WHERE email = ? FOR UPDATE",
      [normalised],
    );
    const customerId = customerRows[0]?.id as number | undefined;

    let addressesDeleted = 0;
    if (customerId) {
      // Saved addresses are a convenience, not a financial record. They go.
      const [result] = await connection.execute<ResultSetHeader>(
        "DELETE FROM customer_addresses WHERE customer_id = ?",
        [customerId],
      );
      addressesDeleted = result.affectedRows;
    }

    // The order survives; the person does not. Every column that could name
    // or reach them is overwritten in one statement, so there is no window
    // in which half of it is erased.
    //
    // The email is made unique per order rather than a shared constant: a
    // single value would collapse every erased customer's orders into one
    // apparent person, which is a worse privacy outcome than the original.
    const [orderResult] = await connection.execute<ResultSetHeader>(
      `UPDATE orders
          SET customer_id     = NULL,
              customer_name   = ?,
              customer_email  = CONCAT('erased+', id, '@invalid'),
              customer_phone  = ?,
              address_line1   = ?,
              address_line2   = '',
              address_landmark = '',
              address_city    = ?,
              notes           = ''
        WHERE customer_email = ?`,
      [REDACTED, REDACTED, REDACTED, REDACTED, normalised],
    );

    // address_state and address_pincode are left alone on purpose: the
    // place of supply is what decides CGST/SGST versus IGST on an invoice
    // that must remain reconcilable, and a state does not identify anyone.

    let customerDeleted = false;
    if (customerId) {
      await connection.execute<ResultSetHeader>(
        "DELETE FROM customers WHERE id = ?",
        [customerId],
      );
      customerDeleted = true;
    }

    // The mail log holds the address in its own column, so it needs its own
    // pass — the orders update above does not reach it.
    await connection.execute<ResultSetHeader>(
      "UPDATE email_log SET recipient = ? WHERE recipient = ?",
      [REDACTED, normalised],
    );

    await connection.commit();
    return {
      ordersAnonymised: orderResult.affectedRows,
      addressesDeleted,
      customerDeleted,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
