import Link from "next/link";
import {
  getSalesSummary,
  getRevenueByDay,
  getTopProducts,
  getLowStock,
  getOrderFunnel,
  getCustomerSummary,
} from "@/db/queries/reports";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatPaise } from "@/lib/money";
import { orderStatusLabel } from "@/lib/order-status";
import { hasSellerIdentity } from "@/lib/env";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90, 365];

const DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: rawDays } = await searchParams;
  const days = WINDOWS.includes(Number(rawDays)) ? Number(rawDays) : 30;

  const [summary, revenue, top, low, funnel, customers] = await Promise.all([
    getSalesSummary(days),
    getRevenueByDay(days),
    getTopProducts(days, 10),
    getLowStock(),
    getOrderFunnel(days),
    getCustomerSummary(days),
  ]);

  const peak = Math.max(1, ...revenue.map((day) => day.grossPaise));
  const inTransitPaise = summary.grossPaise - summary.realisedPaise;

  return (
    <div className="mt-8">
      <Eyebrow>Numbers</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">Reports</h1>

      <nav aria-label="Time window" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {WINDOWS.map((option) => (
            <li key={option}>
              <Link
                href={`/admin/reports?days=${option}`}
                aria-current={days === option ? "page" : undefined}
                className={`inline-block rounded-sm border px-3 py-1.5 text-15 ${
                  days === option
                    ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                    : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
                }`}
              >
                {option === 365 ? "A year" : `${option} days`}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---------------- Headline ---------------- */}

      <dl className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Ordered"
          value={formatPaise(summary.grossPaise)}
          note={`${summary.orders - summary.cancelled} orders, cancellations excluded`}
        />
        <Figure
          label="Collected"
          value={formatPaise(summary.realisedPaise)}
          note="Prepaid and paid, or cash on delivery and delivered"
        />
        <Figure
          label="In transit"
          value={formatPaise(inTransitPaise)}
          note="Ordered but not yet in the bank"
        />
        <Figure
          label="Average order"
          value={formatPaise(summary.averageOrderPaise)}
          note={`${summary.units} units sold`}
        />
      </dl>

      <p className="mt-6 max-w-[70ch] text-15 text-ek-green-700">
        <strong className="font-medium text-ek-green-900">
          Ordered is not collected.
        </strong>{" "}
        Cash on delivery is money you have not been handed until the courier
        hands it over, and treating the two as one figure is how a shop
        believes it is richer than it is. The gap between them is parcels
        still moving — and, on a bad week, parcels refused at the door.
      </p>

      <dl className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Cash on delivery"
          value={String(summary.codOrders)}
          note={`${summary.prepaidOrders} prepaid`}
        />
        <Figure
          label="Discounts given"
          value={formatPaise(summary.discountPaise)}
          note="Off the goods, before tax"
        />
        <Figure
          label="Shipping charged"
          value={formatPaise(summary.shippingPaise)}
        />
        <Figure
          label="GST collected"
          value={formatPaise(summary.taxPaise)}
          note={
            hasSellerIdentity
              ? "CGST + SGST + IGST across the lines"
              : "Zero — no GSTIN is configured, so no tax is collected"
          }
        />
      </dl>

      {/* ---------------- Revenue by day ---------------- */}

      <section className="mt-14 border-t border-ek-green-200 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-26 text-ek-green-900">
            Day by day
          </h2>
          <ExportLink report="revenue" days={days} />
        </div>

        {revenue.length === 0 ? (
          <p className="mt-4 text-17 text-ek-green-700">
            No orders in this window.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-1.5">
            {revenue.map((day) => (
              <li key={day.day} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-15 tabular-nums text-ek-green-700">
                  {DAY.format(new Date(`${day.day}T00:00:00`))}
                </span>
                <span
                  className="h-4 min-w-0.5 bg-ek-green-700"
                  style={{ width: `${(day.grossPaise / peak) * 100}%` }}
                  aria-hidden="true"
                />
                <span className="shrink-0 text-15 tabular-nums text-ek-green-900">
                  {formatPaise(day.grossPaise)}
                </span>
                <span className="shrink-0 text-15 text-ek-green-700">
                  · {day.orders} order{day.orders === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-15 text-ek-green-700">
          Days are Indian days. An order placed at two in the morning belongs
          to that morning, not to the day before.
        </p>
      </section>

      {/* ---------------- Top products ---------------- */}

      <section className="mt-14 border-t border-ek-green-200 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-26 text-ek-green-900">
            What is selling
          </h2>
          <ExportLink report="products" days={days} />
        </div>

        {top.length === 0 ? (
          <p className="mt-4 text-17 text-ek-green-700">Nothing yet.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-ek-green-900">
                  {["Product", "Units", "Orders", "Revenue"].map((heading) => (
                    <th
                      key={heading}
                      className="pb-3 pr-4 text-15 font-medium text-ek-green-700"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top.map((product) => (
                  <tr
                    key={product.productSlug}
                    className="border-b border-ek-green-200"
                  >
                    <td className="py-3 pr-4 text-15 text-ek-green-900">
                      {product.productName}
                    </td>
                    <td className="py-3 pr-4 text-15 tabular-nums text-ek-green-700">
                      {product.units}
                    </td>
                    <td className="py-3 pr-4 text-15 tabular-nums text-ek-green-700">
                      {product.orders}
                    </td>
                    <td className="py-3 pr-4 text-15 tabular-nums text-ek-green-900">
                      {formatPaise(product.revenuePaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------------- Where orders sit ---------------- */}

      <section className="mt-14 border-t border-ek-green-200 pt-8">
        <h2 className="font-display text-26 text-ek-green-900">
          Where orders sit
        </h2>
        <p className="mt-3 max-w-[70ch] text-15 text-ek-green-700">
          Not a conversion funnel — there is no analytics data behind this
          page, and inventing views-to-carts numbers out of order rows would
          be a chart that lies. This is what is waiting on you.
        </p>

        {funnel.length === 0 ? (
          <p className="mt-4 text-17 text-ek-green-700">Nothing yet.</p>
        ) : (
          <ul className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
            {funnel.map((stage) => (
              <li key={stage.status}>
                <p className="text-15 text-ek-green-700">
                  {orderStatusLabel(stage.status)}
                </p>
                <p className="mt-0.5 font-display text-26 tabular-nums text-ek-green-900">
                  {stage.count}
                </p>
                <p className="text-15 text-ek-green-700">
                  {formatPaise(stage.valuePaise)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- Low stock ---------------- */}

      <section className="mt-14 border-t border-ek-green-200 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-26 text-ek-green-900">
            Running low
          </h2>
          <ExportLink report="stock" days={days} />
        </div>

        {low.length === 0 ? (
          <p className="mt-4 text-17 text-ek-green-700">
            Everything is above its threshold.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col">
            {low.map((row) => (
              <li
                key={row.variantId}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ek-green-200 py-3 last:border-b-0"
              >
                <p className="text-17 text-ek-green-900">
                  {row.productName}{" "}
                  <span className="text-ek-green-700">
                    {row.packSizeLabel}
                  </span>
                </p>
                <p className="text-15 text-ek-green-700">
                  <span
                    className={`tabular-nums ${row.stockQty === 0 ? "text-ek-terracotta" : "text-ek-green-900"}`}
                  >
                    {row.stockQty}
                  </span>{" "}
                  left, threshold {row.lowStockThreshold} · sold{" "}
                  {row.soldLast30} in 30 days
                  {row.waitingCustomers > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-ek-gold-800">
                        {row.waitingCustomers} waiting to be told it is back
                      </span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- Customers ---------------- */}

      <section className="mt-14 border-t border-ek-green-200 pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-26 text-ek-green-900">People</h2>
          <ExportLink report="customers" days={days} />
        </div>

        <dl className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Customers" value={String(customers.total)} />
          <Figure
            label="Bought more than once"
            value={String(customers.repeat)}
            note={
              customers.total > 0
                ? `${Math.round((customers.repeat / customers.total) * 100)}% of everyone`
                : undefined
            }
          />
          <Figure
            label={`New in ${days} days`}
            value={String(customers.newInWindow)}
          />
          <Figure
            label="Agreed to marketing"
            value={String(customers.marketingOptIn)}
            note="Only these may be sent anything promotional"
          />
        </dl>

        <p className="mt-6 max-w-[70ch] text-15 text-ek-green-700">
          <Link href="/admin/customers" className="link-draw text-ek-green-900">
            The full list
          </Link>{" "}
          · Exports carry names, addresses and phone numbers. They are
          personal data under the DPDP Act the moment they leave this page —
          keep the file somewhere you would keep a customer&rsquo;s address,
          because that is what it is.
        </p>
      </section>

      <section className="mt-14 border-t border-ek-green-200 pt-8">
        <h2 className="eyebrow text-ek-green-700">Everything, as a file</h2>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <li>
            <ExportLink report="orders" days={days} label="Orders" />
          </li>
          <li>
            <ExportLink report="returns" days={days} label="Returns" />
          </li>
          <li>
            <ExportLink report="audit" days={days} label="Admin activity" />
          </li>
        </ul>
      </section>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <dt className="text-15 text-ek-green-700">{label}</dt>
      <dd className="mt-1 font-display text-26 tabular-nums text-ek-green-900">
        {value}
      </dd>
      {note && <p className="mt-1 text-15 text-ek-green-700">{note}</p>}
    </div>
  );
}

/**
 * A plain link, not a fetch. The browser's own download handling is better
 * than anything worth writing here: it names the file from
 * Content-Disposition, it streams, and it survives a slow query without a
 * spinner that has to be invented.
 */
function ExportLink({
  report,
  days,
  label = "Download CSV",
}: {
  report: string;
  days: number;
  label?: string;
}) {
  return (
    <a
      href={`/api/admin/export/${report}?days=${days}`}
      className="link-draw text-15 text-ek-green-900"
      download
    >
      {label}
    </a>
  );
}
