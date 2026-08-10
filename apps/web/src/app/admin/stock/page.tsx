import { listStock } from "@/db/queries/admin";
import { countWaiting } from "@/db/queries/back-in-stock";
import { StockEditor } from "@/components/admin/StockEditor";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const dynamic = "force-dynamic";

export default async function AdminStockPage() {
  const [rows, waiting] = await Promise.all([listStock(), countWaiting()]);
  const low = rows.filter((row) => row.isLow);
  const totalWaiting = waiting.reduce((sum, row) => sum + row.waiting, 0);

  return (
    <div className="mt-8">
      <Eyebrow>Inventory</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">Stock</h1>

      <p className="mt-5 max-w-[62ch] text-15 text-ek-green-700">
        {low.length === 0
          ? "Every variant is above its low-stock threshold."
          : `${low.length} variant${low.length === 1 ? " is" : "s are"} at or below threshold, highlighted below.`}{" "}
        Saving a new figure refreshes the public catalogue immediately.
      </p>

      {waiting.length > 0 && (
        <section
          aria-labelledby="waiting-heading"
          className="mt-8 border border-ek-gold-500 bg-ek-gold-100 px-5 py-4"
        >
          <h2
            id="waiting-heading"
            className="text-17 font-medium text-ek-green-900"
          >
            {totalWaiting} {totalWaiting === 1 ? "person is" : "people are"}{" "}
            waiting for a pack to come back
          </h2>
          <ul className="mt-3 space-y-1.5 text-15 text-ek-green-900">
            {waiting.map((row) => (
              <li key={row.variantId}>
                <span className="tabular-nums">{row.waiting}</span> ·{" "}
                {row.productName} — {row.packSizeLabel}{" "}
                <span className="text-ek-green-700">({row.sku})</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-15 text-ek-green-700">
            Taking one of these from 0 to any positive number emails everyone
            on its list, once, and clears the count. Editing stock that is
            already above zero sends nothing.
          </p>
        </section>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ek-green-900">
              <th className="pb-3 pr-4 text-15 font-medium text-ek-green-700">
                Variant
              </th>
              <th className="pb-3 pr-4 text-15 font-medium text-ek-green-700">
                Price
              </th>
              <th className="pb-3 pr-4 text-15 font-medium text-ek-green-700">
                In stock
              </th>
              <th className="pb-3 text-15 font-medium text-ek-green-700">
                Set new quantity
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <StockEditor key={row.variantId} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
