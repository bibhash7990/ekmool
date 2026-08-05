import { NextResponse, type NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";
import { getPool, DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row extends RowDataPacket {
  sku: string;
  qty: number;
  product_name: string;
  pack_size_label: string;
  variant_id: number | null;
  current_sku: string | null;
  product_slug: string | null;
  price_inr: number | null;
  mrp_inr: number | null;
  accent: "gold" | "terracotta" | "green" | null;
  stock_qty: number | null;
  is_active: number | null;
  product_active: number | null;
}

/**
 * What a re-order of this order would put in the cart, priced today.
 *
 * Deliberately does not mutate anything: it returns what is available and
 * what is not, and the client adds the available lines to the cart. A
 * re-order that silently dropped a sold-out line would be a small lie
 * discovered at the worst moment, so every line that cannot come along is
 * named and the reason given.
 *
 * Prices come from product_variants as it stands now, never from the old
 * order. Charging last year's price is not a favour anyone asked for.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) {
    return NextResponse.json(
      { error: "We could not find that order.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  try {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT i.sku, i.qty, i.product_name, i.pack_size_label,
              v.id AS variant_id, v.sku AS current_sku, v.price_inr,
              v.mrp_inr, v.stock_qty, v.is_active,
              p.slug AS product_slug, p.accent, p.is_active AS product_active
         FROM order_items i
         LEFT JOIN product_variants v ON v.id = i.variant_id
         LEFT JOIN products p ON p.id = v.product_id
        WHERE i.order_id = ?
        ORDER BY i.id`,
      [id],
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "We could not find that order.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const available = [];
    const unavailable = [];

    for (const row of rows) {
      const label = `${row.product_name} · ${row.pack_size_label}`;

      if (
        row.variant_id === null ||
        row.is_active !== 1 ||
        row.product_active !== 1
      ) {
        unavailable.push({ label, reason: "We no longer stock this one." });
        continue;
      }

      if ((row.stock_qty ?? 0) <= 0) {
        unavailable.push({ label, reason: "Sold out just now." });
        continue;
      }

      // Cap at what is actually on the shelf rather than refusing the line.
      const qty = Math.min(row.qty, row.stock_qty ?? 0, 10);

      available.push({
        variantId: row.variant_id,
        sku: row.current_sku ?? row.sku,
        productSlug: row.product_slug ?? "",
        productName: row.product_name,
        packLabel: row.pack_size_label,
        unitPricePaise: row.price_inr ?? 0,
        mrpPaise: row.mrp_inr ?? row.price_inr ?? 0,
        accent: row.accent ?? "gold",
        qty,
        reducedFrom: qty < row.qty ? row.qty : null,
      });
    }

    return NextResponse.json(
      { available, unavailable },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[orders/reorder] database unavailable:", error);
      return NextResponse.json(
        {
          error: "We could not load that order just now. Please try again shortly.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    console.error("[orders/reorder] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
