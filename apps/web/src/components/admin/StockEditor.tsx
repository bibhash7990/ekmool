"use client";

import { useActionState } from "react";
import { updateStockAction, type ActionResult } from "@/app/admin/actions";
import type { StockRow } from "@/db/queries/admin";
import { formatPaise } from "@/lib/money";

export function StockEditor({ row }: { row: StockRow }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateStockAction,
    null,
  );

  return (
    <tr
      className={`border-b border-ek-green-200 ${
        row.isLow ? "bg-ek-gold-100/50" : ""
      }`}
    >
      <td className="py-3.5 pr-4">
        <span className="block text-15 text-ek-green-900">
          {row.productName}
        </span>
        <span className="block text-15 text-ek-green-700">
          {row.packSizeLabel} · {row.sku}
        </span>
      </td>

      <td className="py-3.5 pr-4 text-15 tabular-nums text-ek-green-700">
        {formatPaise(row.pricePaise)}
      </td>

      <td className="py-3.5 pr-4">
        <span
          className={`text-17 tabular-nums ${
            row.stockQty === 0
              ? "text-ek-terracotta"
              : row.isLow
                ? "text-ek-gold-800"
                : "text-ek-green-900"
          }`}
        >
          {row.stockQty}
        </span>
        {row.isLow && (
          <span className="ml-2 text-15 text-ek-terracotta">
            {row.stockQty === 0
              ? "out of stock"
              : `at or below ${row.lowStockThreshold}`}
          </span>
        )}
      </td>

      <td className="py-3.5">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="variantId" value={row.variantId} />
          <label htmlFor={`stock-${row.variantId}`} className="sr-only">
            New stock quantity for {row.sku}
          </label>
          <input
            id={`stock-${row.variantId}`}
            name="stockQty"
            type="number"
            min={0}
            step={1}
            defaultValue={row.stockQty}
            className="min-h-10 w-24 border border-ek-green-200 bg-ek-paper px-2 py-1.5 text-15 tabular-nums"
          />
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 cursor-pointer bg-ek-green-900 px-3.5 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Set"}
          </button>
          {state && (
            <span
              role="status"
              className={`text-15 ${
                state.ok ? "text-ek-green-700" : "text-ek-terracotta"
              }`}
            >
              {state.message}
            </span>
          )}
        </form>
      </td>
    </tr>
  );
}
