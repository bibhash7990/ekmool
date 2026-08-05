import "server-only";
import { unstable_cache } from "next/cache";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * Its own tag, separate from the catalogue's.
 *
 * Publishing a review must refresh the product pages without pretending
 * the catalogue changed — and, more to the point, without any path being
 * revalidated: `/products/[slug]` sets `dynamicParams = false`, where
 * revalidatePath deletes the prerendered entry rather than marking it
 * stale. See src/lib/revalidate.ts for the full account of that.
 */
export const REVIEWS_TAG = "reviews";
const REVALIDATE_SECONDS = 3600;

/**
 * Reviews, from verified buyers only.
 *
 * The rule is enforced in SQL, not in a check the caller is trusted to
 * have made: every write path goes through `findReviewableOrder`, which
 * only returns an order that is **delivered**, belongs to the session's
 * email, and actually contained that product. There is no function in this
 * file that can create a review without one, which is the same thing as
 * saying there is no way to fabricate one.
 *
 * Nothing is seeded. A product with no reviews shows no rating, no star
 * average and no count — not a zero, not a placeholder. An empty state is
 * honest; an invented one is fraud that happens to be easy.
 */

export interface Review {
  id: number;
  productSlug: string;
  displayName: string;
  rating: number;
  title: string;
  body: string;
  createdAt: Date;
}

interface ReviewRow extends RowDataPacket {
  id: number;
  product_slug: string;
  display_name: string;
  rating: number;
  title: string;
  body: string;
  created_at: Date;
}

/**
 * A short, non-identifying byline: "Bibhash S." from "Bibhash Sharma".
 *
 * Derived rather than typed. A free-text field would let one customer sign
 * a review as another, and publishing the full name the parcel was
 * addressed to is more than anyone agreed to when they bought turmeric.
 */
export function bylineFor(customerName: string): string {
  const parts = customerName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A customer";
  const first = parts[0].slice(0, 40);
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export interface ReviewableOrder {
  orderId: string;
  customerName: string;
  deliveredAt: Date | null;
  alreadyReviewed: boolean;
}

/**
 * The order that entitles this person to review this product, if there is
 * one. Most recent delivered order wins, so someone who has bought the
 * same thing twice reviews against their latest.
 */
export async function findReviewableOrder(params: {
  email: string;
  productSlug: string;
}): Promise<ReviewableOrder | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT o.id, o.customer_name, o.delivered_at,
            (SELECT COUNT(*) FROM reviews r
              WHERE r.order_id = o.id AND r.product_slug = ?) AS reviewed
       FROM orders o
       JOIN order_items i ON i.order_id = o.id
      WHERE o.customer_email = ?
        AND o.status = 'delivered'
        AND i.product_slug = ?
      ORDER BY o.delivered_at DESC, o.created_at DESC
      LIMIT 1`,
    [params.productSlug, params.email.trim().toLowerCase(), params.productSlug],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    orderId: row.id as string,
    customerName: row.customer_name as string,
    deliveredAt: row.delivered_at as Date | null,
    alreadyReviewed: Number(row.reviewed) > 0,
  };
}

export type SubmitOutcome = "submitted" | "not_eligible" | "already_reviewed";

export async function submitReview(params: {
  email: string;
  productSlug: string;
  rating: number;
  title: string;
  body: string;
}): Promise<SubmitOutcome> {
  const eligible = await findReviewableOrder({
    email: params.email,
    productSlug: params.productSlug,
  });
  if (!eligible) return "not_eligible";
  if (eligible.alreadyReviewed) return "already_reviewed";

  const pool = getPool();
  try {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO reviews
         (product_slug, order_id, customer_email, display_name,
          rating, title, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.productSlug,
        eligible.orderId,
        params.email.trim().toLowerCase(),
        bylineFor(eligible.customerName),
        params.rating,
        params.title,
        params.body,
      ],
    );
    return "submitted";
  } catch (error) {
    // The unique index is the real guard against a double submit; the
    // check above is just the friendlier one.
    if (error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY") {
      return "already_reviewed";
    }
    throw error;
  }
}

export interface ProductRating {
  count: number;
  /** Mean to one decimal. Only meaningful when count > 0. */
  average: number;
}

export interface ProductReviews {
  reviews: Review[];
  rating: ProductRating | null;
}

/**
 * Published reviews for a product, and their average.
 *
 * `rating` is null rather than zero when nothing has been published. The
 * distinction matters: a caller that renders `rating.average` cannot
 * accidentally print "0.0 out of 5" for a product nobody has reviewed, and
 * the JSON-LD builder cannot emit an AggregateRating with no ratings in it
 * — which is both a lie and a structured-data violation.
 */
async function loadProductReviews(
  productSlug: string,
  limit = 20,
): Promise<ProductReviews> {
  const pool = getPool();
  // LIMIT is interpolated (after clamping to an integer) because MySQL will
  // not accept a placeholder there in a prepared statement. Nothing from a
  // request reaches it — the value is arithmetic, not text.
  const capped = Math.min(Math.max(Math.floor(limit), 1), 100);

  const [rows] = await pool.execute<ReviewRow[]>(
    `SELECT id, product_slug, display_name, rating, title, body, created_at
       FROM reviews
      WHERE product_slug = ? AND status = 'published'
      ORDER BY created_at DESC
      LIMIT ${capped}`,
    [productSlug],
  );

  if (rows.length === 0) return { reviews: [], rating: null };

  // Averaged over the published set, which is the set on the page. A mean
  // that includes rejected or pending rows would not match the reviews a
  // reader can count for themselves.
  const [agg] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) n, AVG(rating) avg_rating
       FROM reviews WHERE product_slug = ? AND status = 'published'`,
    [productSlug],
  );

  const count = Number(agg[0].n);
  return {
    reviews: rows.map((row) => ({
      id: row.id,
      productSlug: row.product_slug,
      displayName: row.display_name,
      rating: row.rating,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
    })),
    rating:
      count > 0
        ? { count, average: Math.round(Number(agg[0].avg_rating) * 10) / 10 }
        : null,
  };
}

/**
 * Cached and tagged, so a product page stays static and browsing still
 * never touches MySQL. Publishing a review purges the tag.
 */
export const getProductReviews = unstable_cache(
  loadProductReviews,
  ["product-reviews"],
  { tags: [REVIEWS_TAG], revalidate: REVALIDATE_SECONDS },
);

/* ------------------------------------------------------------------ */
/* Moderation                                                          */

export interface PendingReview extends Review {
  status: "pending" | "published" | "rejected";
  customerEmail: string;
  orderId: string;
}

export async function listReviewsForModeration(
  status: "pending" | "published" | "rejected" = "pending",
): Promise<PendingReview[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, product_slug, display_name, rating, title, body,
            created_at, status, customer_email, order_id
       FROM reviews
      WHERE status = ?
      ORDER BY created_at ASC
      LIMIT 200`,
    [status],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    productSlug: row.product_slug as string,
    displayName: row.display_name as string,
    rating: Number(row.rating),
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as Date,
    status: row.status as PendingReview["status"],
    customerEmail: row.customer_email as string,
    orderId: row.order_id as string,
  }));
}

export async function moderateReview(
  id: number,
  status: "published" | "rejected",
  note: string | null,
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE reviews
        SET status = ?, moderator_note = ?,
            published_at = CASE
              WHEN ? = 'published' AND published_at IS NULL THEN NOW()
              ELSE published_at
            END
      WHERE id = ?`,
    [status, note, status, id],
  );
  return result.affectedRows > 0;
}

export async function countPendingReviews(): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) n FROM reviews WHERE status = 'pending'`,
  );
  return Number(rows[0].n);
}
