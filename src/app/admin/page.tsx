import Link from "next/link";
import { listOrders, countOrdersByStatus, isOrderStatus } from "@/db/queries/admin";
import { OrderRow } from "@/components/admin/OrderRow";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatPaise } from "@/lib/money";
import { listOpenReturns, reasonLabel } from "@/db/queries/returns";

export const dynamic = "force-dynamic";

const RETURN_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status && isOrderStatus(status) ? status : undefined;

  const [orders, counts, openReturns] = await Promise.all([
    listOrders({ status: filter }),
    countOrdersByStatus(),
    listOpenReturns(),
  ]);

  const revenuePaise = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.totalPaise, 0);

  return (
    <div className="mt-8">
      <Eyebrow>Operations</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">Orders</h1>

      {openReturns.length > 0 && (
        <section
          aria-labelledby="open-returns"
          className="mt-6 rounded-sm border border-ek-gold-800 bg-ek-cream p-5"
        >
          <h2
            id="open-returns"
            className="font-display text-20 text-ek-green-900"
          >
            {openReturns.length} return{openReturns.length === 1 ? "" : "s"} to
            deal with
          </h2>
          <ul className="mt-4 flex flex-col gap-4">
            {openReturns.map((request) => (
              <li
                key={request.id}
                className="border-t border-ek-green-200 pt-4 first:border-0 first:pt-0"
              >
                <p className="text-15 text-ek-green-700">
                  <span className="font-medium tabular-nums text-ek-green-900">
                    {request.orderRef}
                  </span>{" "}
                  · {reasonLabel(request.reason)} ·{" "}
                  {RETURN_DATE.format(request.createdAt)}
                </p>
                <p className="mt-1 max-w-[70ch] text-17 text-ek-green-900">
                  {request.detail}
                </p>
                <p className="mt-1 text-15 text-ek-green-700">
                  {request.customerName} ·{" "}
                  <a
                    href={`mailto:${request.customerEmail}?subject=${encodeURIComponent(
                      `Your return — order ${request.orderRef}`,
                    )}`}
                    className="link-draw text-ek-green-900"
                  >
                    {request.customerEmail}
                  </a>
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-[62ch] text-15 text-ek-green-700">
            Reply to the customer and settle it with them directly. Approving,
            rejecting and marking a refund from here is not built yet, so these
            stay listed until it is — which is the safer way round: nothing
            disappears from this list without you having done something about
            it.
          </p>
        </section>
      )}

      <nav aria-label="Filter by status" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/admin"
              aria-current={!filter ? "page" : undefined}
              className={`inline-block rounded-sm border px-3 py-1.5 text-15 ${
                !filter
                  ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                  : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
              }`}
            >
              All
            </Link>
          </li>
          {counts.map((entry) => (
            <li key={entry.status}>
              <Link
                href={`/admin?status=${entry.status}`}
                aria-current={filter === entry.status ? "page" : undefined}
                className={`inline-block rounded-sm border px-3 py-1.5 text-15 ${
                  filter === entry.status
                    ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                    : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
                }`}
              >
                {entry.status}{" "}
                <span className="tabular-nums opacity-70">{entry.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mt-6 text-15 text-ek-green-700">
        Showing {orders.length} order{orders.length === 1 ? "" : "s"} ·{" "}
        {formatPaise(revenuePaise)} excluding cancellations
      </p>

      {orders.length === 0 ? (
        <p className="mt-10 text-17 text-ek-green-700">
          No orders match this filter yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-ek-green-900">
                <th className="pb-3 pr-4 text-15 font-medium text-ek-green-700">
                  Reference
                </th>
                <th className="pb-3 pr-4 text-15 font-medium text-ek-green-700">
                  Customer
                </th>
                <th className="pb-3 pr-4 text-15 font-medium text-ek-green-700">
                  Value
                </th>
                <th className="pb-3 pr-4 text-15 font-medium text-ek-green-700">
                  Status
                </th>
                <th className="pb-3 text-15 font-medium text-ek-green-700">
                  Update
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 max-w-[62ch] text-15 text-ek-green-700">
        Setting an order to <strong>shipped</strong> sends the customer their
        shipping email once, with the tracking id if one is entered. Re-saving
        a shipped order does not send it again.
      </p>
    </div>
  );
}
