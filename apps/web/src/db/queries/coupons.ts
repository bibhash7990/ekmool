import "server-only";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/db/pool";
import {
  couponBenefit,
  type Coupon,
  type CouponBenefit,
  type CouponRefusal,
} from "@ekmool/core/coupons";

/**
 * Coupon lookup, validation and claiming.
 *
 * There are two entry points and they are deliberately asymmetric:
 *
 *   previewCoupon  — read-only, for the cart. Tells the customer what a
 *                    code is worth. Guesses at nothing and reserves nothing.
 *   claimCouponTx  — inside the checkout transaction, under a row lock on
 *                    the coupon. This is the only authority.
 *
 * The preview exists to be helpful, not to be trusted. Everything it
 * decides is decided again at checkout against locked rows, because between
 * the two the basket can change, the code can be exhausted by someone else,
 * and the clock can pass the expiry.
 */

interface CouponRow extends RowDataPacket {
  id: number;
  code: string;
  description: string;
  kind: "percent" | "flat" | "free_shipping";
  percent_bps: number | null;
  amount_paise: number | null;
  max_discount_paise: number | null;
  min_subtotal_paise: number;
  starts_at: Date | null;
  ends_at: Date | null;
  global_limit: number | null;
  per_customer_limit: number;
  times_used: number;
  is_active: number;
}

function toCoupon(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    kind: row.kind,
    percentBps: row.percent_bps,
    amountPaise: row.amount_paise,
    maxDiscountPaise: row.max_discount_paise,
    minSubtotalPaise: row.min_subtotal_paise,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    globalLimit: row.global_limit,
    perCustomerLimit: row.per_customer_limit,
    timesUsed: row.times_used,
    isActive: row.is_active === 1,
  };
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Basket value from catalogue prices, for the cart's coupon preview.
 *
 * Prices come from the database and never from the request. A client that
 * could name its own subtotal could name one a rupee above a coupon's
 * minimum — and unknown or inactive variants contribute nothing rather
 * than erroring, because a stale cart is a normal thing to hold.
 */
export async function subtotalForItems(
  items: { variantId: number; qty: number }[],
): Promise<number> {
  if (items.length === 0) return 0;
  const pool = getPool();
  const ids = items.map((item) => item.variantId);
  const placeholders = ids.map(() => "?").join(",");

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT v.id, v.price_inr
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE v.id IN (${placeholders}) AND v.is_active = 1 AND p.is_active = 1`,
    ids,
  );

  const priceById = new Map(
    rows.map((row) => [Number(row.id), Number(row.price_inr)]),
  );
  return items.reduce(
    (sum, item) => sum + (priceById.get(item.variantId) ?? 0) * item.qty,
    0,
  );
}

export type CouponCheck =
  | { ok: true; coupon: Coupon; benefit: CouponBenefit }
  | { ok: false; reason: CouponRefusal; coupon: Coupon | null };

/**
 * Every rule except the per-customer cap, which needs its own query and is
 * applied by both callers around this.
 */
function evaluate(
  coupon: Coupon,
  subtotalPaise: number,
  shippingPaise: number,
  now: Date,
): CouponCheck {
  if (!coupon.isActive) return { ok: false, reason: "inactive", coupon };
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false, reason: "not_started", coupon };
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    return { ok: false, reason: "expired", coupon };
  }
  if (subtotalPaise < coupon.minSubtotalPaise) {
    return { ok: false, reason: "below_minimum", coupon };
  }
  if (coupon.globalLimit !== null && coupon.timesUsed >= coupon.globalLimit) {
    return { ok: false, reason: "exhausted", coupon };
  }

  const benefit = couponBenefit(coupon, subtotalPaise, shippingPaise);

  // A free-shipping code on an order that already ships free takes nothing
  // off. Saying so beats applying it and showing a discount of zero.
  if (benefit.benefitPaise <= 0) {
    return { ok: false, reason: "no_benefit", coupon };
  }

  return { ok: true, coupon, benefit };
}

async function countCustomerRedemptions(
  runner: PoolConnection | ReturnType<typeof getPool>,
  couponId: number,
  email: string,
): Promise<number> {
  const [rows] = await runner.execute<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM coupon_redemptions
      WHERE coupon_id = ? AND customer_email = ?`,
    [couponId, email],
  );
  return Number(rows[0].n);
}

/**
 * What a code is worth, without reserving anything.
 *
 * `email` is optional because the cart may not know it yet — a guest can
 * try a code before typing an address. When it is absent the per-customer
 * cap simply is not checked here; checkout still checks it.
 */
export async function previewCoupon(params: {
  code: string;
  subtotalPaise: number;
  shippingPaise: number;
  email?: string | null;
  now?: Date;
}): Promise<CouponCheck> {
  const pool = getPool();
  const code = normaliseCode(params.code);

  const [rows] = await pool.execute<CouponRow[]>(
    `SELECT * FROM coupons WHERE code = ?`,
    [code],
  );
  if (!rows[0]) return { ok: false, reason: "unknown", coupon: null };

  const coupon = toCoupon(rows[0]);
  const result = evaluate(
    coupon,
    params.subtotalPaise,
    params.shippingPaise,
    params.now ?? new Date(),
  );
  if (!result.ok) return result;

  if (params.email) {
    const used = await countCustomerRedemptions(
      pool,
      coupon.id,
      params.email.trim().toLowerCase(),
    );
    if (used >= coupon.perCustomerLimit) {
      return { ok: false, reason: "already_used", coupon };
    }
  }

  return result;
}

/**
 * Claims a coupon for an order, inside the caller's transaction.
 *
 * `SELECT ... FOR UPDATE` on the coupon row is what makes a "first 100
 * orders" cap true rather than approximately true: two checkouts racing for
 * the hundredth use serialise on that row, and the second reads the
 * incremented counter rather than the stale one.
 *
 * The redemption row is not written here — the order does not exist yet.
 * The caller writes it after the order insert, which is why
 * `recordRedemptionTx` is separate. Both are in the same transaction, so
 * either both land or neither does.
 */
export async function claimCouponTx(
  connection: PoolConnection,
  params: {
    code: string;
    subtotalPaise: number;
    shippingPaise: number;
    email: string;
    now?: Date;
  },
): Promise<CouponCheck> {
  const code = normaliseCode(params.code);
  const email = params.email.trim().toLowerCase();

  const [rows] = await connection.execute<CouponRow[]>(
    `SELECT * FROM coupons WHERE code = ? FOR UPDATE`,
    [code],
  );
  if (!rows[0]) return { ok: false, reason: "unknown", coupon: null };

  const coupon = toCoupon(rows[0]);
  const result = evaluate(
    coupon,
    params.subtotalPaise,
    params.shippingPaise,
    params.now ?? new Date(),
  );
  if (!result.ok) return result;

  const used = await countCustomerRedemptions(connection, coupon.id, email);
  if (used >= coupon.perCustomerLimit) {
    return { ok: false, reason: "already_used", coupon };
  }

  await connection.execute<ResultSetHeader>(
    `UPDATE coupons SET times_used = times_used + 1 WHERE id = ?`,
    [coupon.id],
  );

  return result;
}

export async function recordRedemptionTx(
  connection: PoolConnection,
  params: {
    couponId: number;
    orderId: string;
    email: string;
    discountPaise: number;
  },
): Promise<void> {
  await connection.execute<ResultSetHeader>(
    `INSERT INTO coupon_redemptions
       (coupon_id, order_id, customer_email, discount_paise)
     VALUES (?, ?, ?, ?)`,
    [
      params.couponId,
      params.orderId,
      params.email.trim().toLowerCase(),
      params.discountPaise,
    ],
  );
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */

export interface CouponSummary extends Coupon {
  redemptions: number;
  discountGivenPaise: number;
}

export async function listCoupons(): Promise<CouponSummary[]> {
  const pool = getPool();
  const [rows] = await pool.query<CouponRow[]>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id)
              AS redemptions,
            (SELECT COALESCE(SUM(r.discount_paise), 0) FROM coupon_redemptions r
              WHERE r.coupon_id = c.id) AS discount_given
       FROM coupons c
      ORDER BY c.is_active DESC, c.created_at DESC`,
  );

  return rows.map((row) => ({
    ...toCoupon(row),
    redemptions: Number(row.redemptions),
    discountGivenPaise: Number(row.discount_given),
  }));
}

export interface CouponInput {
  code: string;
  description: string;
  kind: "percent" | "flat" | "free_shipping";
  percentBps: number | null;
  amountPaise: number | null;
  maxDiscountPaise: number | null;
  minSubtotalPaise: number;
  endsAt: Date | null;
  globalLimit: number | null;
  perCustomerLimit: number;
}

export async function createCoupon(input: CouponInput): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO coupons
       (code, description, kind, percent_bps, amount_paise,
        max_discount_paise, min_subtotal_paise, ends_at,
        global_limit, per_customer_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normaliseCode(input.code),
      input.description,
      input.kind,
      input.percentBps,
      input.amountPaise,
      input.maxDiscountPaise,
      input.minSubtotalPaise,
      input.endsAt,
      input.globalLimit,
      input.perCustomerLimit,
    ],
  );
  return result.insertId;
}

/**
 * Switches a coupon off, or back on. There is deliberately no delete: a
 * coupon that has been redeemed is referenced by orders, and the foreign
 * key would refuse anyway. Deactivating is what "removing" means here.
 */
export async function setCouponActive(
  id: number,
  active: boolean,
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE coupons SET is_active = ? WHERE id = ?`,
    [active ? 1 : 0, id],
  );
  return result.affectedRows > 0;
}
