import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";
import { timingSafeEquals } from "@/lib/crypto";

/**
 * Return requests, bounded by what /refund-policy actually promises. The
 * windows below are that policy in code — change one and change the other,
 * or the site is promising something it will not honour.
 */

export type ReturnReason =
  | "damaged"
  | "wrong_item"
  | "missing_item"
  | "unopened_change_of_mind";

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "received"
  | "refunded";

export interface ReturnRequest {
  id: number;
  orderId: string;
  reason: ReturnReason;
  detail: string;
  status: ReturnStatus;
  resolution: string | null;
  createdAt: Date;
}

export const RETURN_REASONS: {
  value: ReturnReason;
  label: string;
  windowHours: number;
  help: string;
}[] = [
  {
    value: "damaged",
    label: "It arrived damaged",
    windowHours: 48,
    help: "Leaking, crushed or a broken seal. Photographs help — reply to your confirmation email with them.",
  },
  {
    value: "wrong_item",
    label: "The wrong item arrived",
    windowHours: 48,
    help: "A different product or a different pack size from what you ordered.",
  },
  {
    value: "missing_item",
    label: "Something was missing",
    windowHours: 48,
    help: "Part of the order was not in the parcel.",
  },
  {
    value: "unopened_change_of_mind",
    label: "I changed my mind — the pack is unopened",
    windowHours: 24 * 7,
    help: "Only sealed, unopened packs. Return postage is at your cost and the original shipping is not refunded. Opened food cannot be resold, so it cannot be taken back.",
  },
];

export function reasonWindowHours(reason: ReturnReason): number {
  return RETURN_REASONS.find((r) => r.value === reason)?.windowHours ?? 0;
}

export function reasonLabel(reason: ReturnReason): string {
  return RETURN_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/** The longest window any reason allows. */
const LONGEST_WINDOW_HOURS = Math.max(
  ...RETURN_REASONS.map((reason) => reason.windowHours),
);

/**
 * Is it still worth offering the return form at all?
 *
 * Deliberately generous — it answers for the longest window of any reason,
 * because the per-reason window is enforced in createReturnRequest where it
 * belongs. This only decides whether to ask, so that a customer looking at
 * a month-old order is not invited to report damage they cannot report.
 *
 * Lives here rather than in the page because reading the clock inside a
 * component body is exactly the kind of impurity React tells you not to
 * write, and because the rule belongs next to the other return rules.
 */
export function isReturnWindowOpen(
  deliveredAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!deliveredAt) return false;
  const elapsedHours = (now.getTime() - deliveredAt.getTime()) / 3_600_000;
  return elapsedHours <= LONGEST_WINDOW_HOURS;
}

export type ReturnRefusal =
  | "not_found"
  | "not_yours"
  | "not_delivered"
  | "window_closed"
  | "already_requested";

export type CreateReturnResult =
  | { ok: true; id: number }
  | { ok: false; reason: ReturnRefusal; hoursAllowed?: number };

export async function getReturnForOrder(
  orderId: string,
): Promise<ReturnRequest | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, order_id, reason, detail, status, resolution, created_at
       FROM return_requests WHERE order_id = ?`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id as number,
    orderId: row.order_id as string,
    reason: row.reason as ReturnReason,
    detail: row.detail as string,
    status: row.status as ReturnStatus,
    resolution: row.resolution as string | null,
    createdAt: row.created_at as Date,
  };
}

export interface OpenReturn {
  id: number;
  orderId: string;
  orderRef: string;
  customerEmail: string;
  customerName: string;
  reason: ReturnReason;
  detail: string;
  createdAt: Date;
}

/**
 * Everything still waiting on the owner — the badge on the orders page.
 *
 * This existed before the queue below did, because the alternative was
 * worse than incomplete: a customer reports damage, the row lands in the
 * table, and nobody is ever told. A request that reaches no one is not a
 * returns feature, it is a form that lies.
 */
export async function listOpenReturns(): Promise<OpenReturn[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT r.id, r.order_id, o.order_ref, o.customer_email, o.customer_name,
            r.reason, r.detail, r.created_at
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
      WHERE r.status IN ('requested', 'approved', 'received')
      ORDER BY r.created_at ASC`,
  );

  return rows.map((row) => ({
    id: row.id as number,
    orderId: row.order_id as string,
    orderRef: String(row.order_ref ?? "").toUpperCase(),
    customerEmail: row.customer_email as string,
    customerName: row.customer_name as string,
    reason: row.reason as ReturnReason,
    detail: row.detail as string,
    createdAt: row.created_at as Date,
  }));
}

/* ------------------------------------------------------------------ */
/* The moderation queue                                                */

export interface QueuedReturn extends OpenReturn {
  status: ReturnStatus;
  resolution: string | null;
  totalPaise: number;
  paymentMethod: "cod" | "razorpay";
  paymentStatus: string;
  orderStatus: string;
  updatedAt: Date;
}

/**
 * The queue, filtered by status. Ordered oldest first: a return that has
 * been sitting for a week is more urgent than one that arrived this
 * morning, and sorting newest-first is how the old ones never get done.
 */
export async function listReturns(
  status?: ReturnStatus,
): Promise<QueuedReturn[]> {
  const pool = getPool();
  const where = status ? "WHERE r.status = ?" : "";
  const params = status ? [status] : [];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.id, r.order_id, r.reason, r.detail, r.status, r.resolution,
            r.created_at, r.updated_at,
            o.order_ref, o.customer_email, o.customer_name, o.total_paise,
            o.payment_method, o.payment_status, o.status AS order_status
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
       ${where}
      ORDER BY r.created_at ASC
      LIMIT 500`,
    params,
  );

  return rows.map((row) => ({
    id: row.id as number,
    orderId: row.order_id as string,
    orderRef: String(row.order_ref ?? "").toUpperCase(),
    customerEmail: row.customer_email as string,
    customerName: row.customer_name as string,
    reason: row.reason as ReturnReason,
    detail: row.detail as string,
    status: row.status as ReturnStatus,
    resolution: (row.resolution as string | null) ?? null,
    totalPaise: Number(row.total_paise),
    paymentMethod: row.payment_method as "cod" | "razorpay",
    paymentStatus: row.payment_status as string,
    orderStatus: row.order_status as string,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  }));
}

export async function countReturnsByStatus(): Promise<
  Record<ReturnStatus, number>
> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT status, COUNT(*) AS n FROM return_requests GROUP BY status`,
  );

  const counts: Record<ReturnStatus, number> = {
    requested: 0,
    approved: 0,
    rejected: 0,
    received: 0,
    refunded: 0,
  };
  for (const row of rows) {
    counts[row.status as ReturnStatus] = Number(row.n);
  }
  return counts;
}

/**
 * Which decisions are available from where.
 *
 * A table rather than a chain of ifs, because the illegal transitions are
 * the interesting ones and a table shows them by omission. `rejected` and
 * `refunded` are terminal: money having moved, or a decision having been
 * communicated, is not something to quietly walk back — reopen it by
 * talking to the customer and, if it really must change, in the database
 * with a note, where it leaves a mark.
 */
const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["received", "rejected"],
  received: ["refunded", "rejected"],
  rejected: [],
  refunded: [],
};

export function allowedTransitions(from: ReturnStatus): ReturnStatus[] {
  return TRANSITIONS[from] ?? [];
}

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Waiting on you",
  approved: "Approved — awaiting the parcel",
  received: "Parcel received",
  refunded: "Refunded",
  rejected: "Declined",
};

export type ReturnDecisionResult =
  | {
      ok: true;
      previous: ReturnStatus;
      orderId: string;
      customerEmail: string;
      customerName: string;
      totalPaise: number;
      /** True when this decision also marked the order refunded. */
      orderMarkedRefunded: boolean;
    }
  | { ok: false; reason: "not_found" | "illegal_transition"; from?: ReturnStatus };

/**
 * The owner's decision on a return.
 *
 * Marking one **refunded** also sets the order's payment_status, because
 * this schema has one return per order (uq_return_order) — a return here is
 * a whole-order return, so an order whose return is refunded and whose
 * payment still reads "paid" is a contradiction someone would eventually
 * have to reconcile by hand. It writes an order_status_history row too, so
 * the customer's own timeline shows the refund rather than going quiet.
 *
 * Both writes are in the transaction that moves the return, so there is no
 * window where the return says refunded and the order does not.
 */
export async function decideReturn(params: {
  id: number;
  status: ReturnStatus;
  resolution: string | null;
  actor: string;
}): Promise<ReturnDecisionResult> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT r.status, r.order_id, o.customer_email, o.customer_name,
              o.total_paise, o.payment_status
         FROM return_requests r
         JOIN orders o ON o.id = r.order_id
        WHERE r.id = ?
        FOR UPDATE`,
      [params.id],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return { ok: false, reason: "not_found" };
    }

    const previous = row.status as ReturnStatus;
    if (!allowedTransitions(previous).includes(params.status)) {
      await connection.rollback();
      return { ok: false, reason: "illegal_transition", from: previous };
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE return_requests SET status = ?, resolution = ? WHERE id = ?`,
      [params.status, params.resolution, params.id],
    );

    let orderMarkedRefunded = false;
    if (params.status === "refunded" && row.payment_status !== "refunded") {
      await connection.execute<ResultSetHeader>(
        `UPDATE orders SET payment_status = 'refunded' WHERE id = ?`,
        [row.order_id],
      );
      orderMarkedRefunded = true;
    }

    await connection.execute<ResultSetHeader>(
      `INSERT INTO order_status_history (order_id, from_status, to_status, note, actor)
       VALUES (?, ?, ?, ?, ?)`,
      [
        row.order_id,
        `return:${previous}`,
        `return:${params.status}`,
        params.resolution?.slice(0, 300) ?? null,
        params.actor,
      ],
    );

    await connection.commit();

    return {
      ok: true,
      previous,
      orderId: row.order_id as string,
      customerEmail: row.customer_email as string,
      customerName: row.customer_name as string,
      totalPaise: Number(row.total_paise),
      orderMarkedRefunded,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Opens a return request. Everything the policy requires is checked here
 * rather than in the form, because the form is a convenience and this is
 * the rule.
 *
 * The email must already have been verified — it comes from the session
 * cookie, never from the request body.
 */
export async function createReturnRequest(params: {
  orderId: string;
  verifiedEmail: string;
  reason: ReturnReason;
  detail: string;
}): Promise<CreateReturnResult> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT customer_email, status, delivered_at FROM orders
        WHERE id = ? FOR UPDATE`,
      [params.orderId],
    );
    const order = rows[0];
    if (!order) {
      await connection.rollback();
      return { ok: false, reason: "not_found" };
    }

    if (
      !timingSafeEquals(
        String(order.customer_email).toLowerCase(),
        params.verifiedEmail.toLowerCase(),
      )
    ) {
      await connection.rollback();
      return { ok: false, reason: "not_yours" };
    }

    if (order.status !== "delivered" || !order.delivered_at) {
      await connection.rollback();
      return { ok: false, reason: "not_delivered" };
    }

    const hoursAllowed = reasonWindowHours(params.reason);
    const elapsedHours =
      (Date.now() - new Date(order.delivered_at as Date).getTime()) / 3_600_000;
    if (elapsedHours > hoursAllowed) {
      await connection.rollback();
      return { ok: false, reason: "window_closed", hoursAllowed };
    }

    try {
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO return_requests (order_id, reason, detail)
         VALUES (?, ?, ?)`,
        [params.orderId, params.reason, params.detail],
      );

      // On the order's own timeline, in the same transaction. A return that
      // is invisible on the page the customer is looking at reads as though
      // the form did nothing.
      //
      // from_status is 'delivered' — which it is, that being the only status
      // a return can be opened from — and not NULL. A NULL there means "the
      // order was placed" to OrderTimeline, and this row would render as a
      // second, later "Order placed".
      await connection.execute<ResultSetHeader>(
        `INSERT INTO order_status_history (order_id, from_status, to_status, note, actor)
         VALUES (?, 'delivered', 'return:requested', ?, 'customer')`,
        [params.orderId, reasonLabel(params.reason)],
      );

      await connection.commit();
      return { ok: true, id: result.insertId };
    } catch (error) {
      await connection.rollback();
      // The unique index on order_id is what makes "one open request per
      // order" true under a double submit, not the check-then-insert above.
      if (error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY") {
        return { ok: false, reason: "already_requested" };
      }
      throw error;
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
