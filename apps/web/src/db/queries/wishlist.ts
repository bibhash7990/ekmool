import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

/**
 * The server copy of a wishlist.
 *
 * Exists so a saved list survives a new phone, and nothing more: the
 * browser copy in src/lib/wishlist.ts is what every page actually reads.
 * Every function here takes `customerId` in the WHERE clause even where the
 * row id alone would be unique — ownership is a property of the query, not
 * of the caller having remembered to check.
 */

interface SlugRow extends RowDataPacket {
  product_slug: string;
}

export async function listWishlist(customerId: number): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.execute<SlugRow[]>(
    `SELECT product_slug FROM wishlist_items
      WHERE customer_id = ?
      ORDER BY created_at DESC`,
    [customerId],
  );
  return rows.map((row) => row.product_slug);
}

/**
 * Folds the browser's list into the server's and returns the result.
 *
 * A union, not a replacement: a device that has been offline for a week
 * still holds real intent, and the other direction — server wins — would
 * silently delete something someone saved five minutes ago on the phone in
 * their hand. The cost of choosing union is that a removal on one device
 * can be undone by another device that still has the item; that trade is
 * argued in src/lib/wishlist.ts.
 */
export async function mergeWishlist(
  customerId: number,
  slugs: string[],
): Promise<string[]> {
  const pool = getPool();

  if (slugs.length > 0) {
    // One statement, so a slow connection cannot leave half a list merged.
    const values = slugs.map(() => "(?, ?)").join(", ");
    const params = slugs.flatMap((slug) => [customerId, slug]);
    await pool.execute<ResultSetHeader>(
      `INSERT INTO wishlist_items (customer_id, product_slug)
       VALUES ${values}
       ON DUPLICATE KEY UPDATE product_slug = product_slug`,
      params,
    );
  }

  return listWishlist(customerId);
}

/**
 * Makes the stored list exactly `slugs`.
 *
 * Used only while the visitor is on /wishlist managing it, where a removal
 * is an instruction rather than a stale device's opinion. Delete and insert
 * in one transaction so a failure half way through cannot leave someone
 * with an empty list.
 */
export async function replaceWishlist(
  customerId: number,
  slugs: string[],
): Promise<string[]> {
  const pool = getPool();
  const connection = await pool.getConnection();
  const unique = [...new Set(slugs)];

  try {
    await connection.beginTransaction();

    await connection.execute<ResultSetHeader>(
      `DELETE FROM wishlist_items WHERE customer_id = ?`,
      [customerId],
    );

    if (unique.length > 0) {
      const values = unique.map(() => "(?, ?)").join(", ");
      await connection.execute<ResultSetHeader>(
        `INSERT INTO wishlist_items (customer_id, product_slug) VALUES ${values}`,
        unique.flatMap((slug) => [customerId, slug]),
      );
    }

    await connection.commit();
    return unique;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
