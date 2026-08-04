import { listStock } from "@/db/queries/admin";
import { StockEditor } from "@/components/admin/StockEditor";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const dynamic = "force-dynamic";

export default async function AdminStockPage() {
  const rows = await listStock();
  const low = rows.filter((row) => row.isLow);

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
