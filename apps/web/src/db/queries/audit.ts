import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * The admin audit log.
 *
 * One writer, two readers, and deliberately no update and no delete. A log
 * the application can rewrite is not evidence of anything, and the moment
 * an `editAuditEntry` exists somebody will call it.
 *
 * What it is for: six months from now, "why is this priced at ₹640" has an
 * answer, and so does "who archived the 500 g pack". Both are questions a
 * single-owner shop asks itself, not just questions an auditor asks.
 */

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  detail: Record<string, unknown> | null;
  createdAt: Date;
}

/** A field that changed, as it was and as it now is. */
export type AuditDetail = Record<string, { from: unknown; to: unknown }>;

/**
 * Records an admin action. Never throws.
 *
 * That is the important property. The log is a record of work that has
 * already been committed — the price is changed, the product is archived —
 * so a failure to write the log must not turn a successful edit into an
 * error the owner sees and retries. It is reported to the server console
 * loudly instead, where it is a bug to fix rather than a customer-facing
 * failure.
 *
 * Note what is not passed in anywhere: no secrets, no session tokens, and
 * no customer addresses. The log is read by whoever can reach /admin, which
 * is a smaller set than "nobody", but a log is a copy of data and every copy
 * is a place it can leak from. Order and customer *identifiers* are enough
 * to find the record; the record itself already exists elsewhere.
 */
export async function recordAdminAction(params: {
  actor: string;
  action: string;
  entityType: string;
  entityId: string | number;
  summary: string;
  detail?: AuditDetail | Record<string, unknown> | null;
}): Promise<void> {
  try {
    const pool = getPool();
    await pool.execute<ResultSetHeader>(
      `INSERT INTO admin_audit_log
         (actor, action, entity_type, entity_id, summary, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        params.actor.slice(0, 120),
        params.action.slice(0, 60),
        params.entityType.slice(0, 40),
        String(params.entityId).slice(0, 64),
        params.summary.slice(0, 300),
        params.detail ? JSON.stringify(params.detail) : null,
      ],
    );
  } catch (error) {
    console.error("[audit] could not record admin action:", error);
  }
}

/**
 * Only the fields that actually moved.
 *
 * An audit entry reading "price: from 64000 to 64000" alongside one real
 * change is noise, and noise is what stops a log from being read. Compared
 * with Object.is so that a NaN slipping through a bad parse is visible
 * rather than silently equal to itself.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): AuditDetail {
  const detail: AuditDetail = {};
  for (const [field, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const previous = before[field];
    if (!Object.is(previous, next)) {
      detail[field] = { from: previous ?? null, to: next ?? null };
    }
  }
  return detail;
}

interface AuditRow extends RowDataPacket {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  detail: unknown;
  created_at: Date;
}

function toEntry(row: AuditRow): AuditEntry {
  // mysql2 parses a JSON column for us, but a row written before the column
  // existed — or by hand — can still arrive as a string.
  let detail: Record<string, unknown> | null = null;
  if (row.detail && typeof row.detail === "object") {
    detail = row.detail as Record<string, unknown>;
  } else if (typeof row.detail === "string" && row.detail) {
    try {
      detail = JSON.parse(row.detail) as Record<string, unknown>;
    } catch {
      detail = null;
    }
  }

  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    detail,
    createdAt: row.created_at,
  };
}

export async function listAuditLog(limit = 100): Promise<AuditEntry[]> {
  const pool = getPool();
  // LIMIT is interpolated (after clamping to an integer) because MySQL will
  // not accept a placeholder there in a prepared statement. Nothing from a
  // request reaches it — the value is arithmetic, not text.
  const capped = Math.min(Math.max(Math.floor(limit), 1), 500);

  const [rows] = await pool.query<AuditRow[]>(
    `SELECT id, actor, action, entity_type, entity_id, summary, detail,
            created_at
       FROM admin_audit_log
      ORDER BY id DESC
      LIMIT ${capped}`,
  );
  return rows.map(toEntry);
}

/** The history of one thing — every change to a single product, say. */
export async function listAuditForEntity(
  entityType: string,
  entityId: string | number,
  limit = 50,
): Promise<AuditEntry[]> {
  const pool = getPool();
  const capped = Math.min(Math.max(Math.floor(limit), 1), 200);

  const [rows] = await pool.query<AuditRow[]>(
    `SELECT id, actor, action, entity_type, entity_id, summary, detail,
            created_at
       FROM admin_audit_log
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY id DESC
      LIMIT ${capped}`,
    [entityType, String(entityId)],
  );
  return rows.map(toEntry);
}
