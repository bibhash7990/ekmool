import Link from "next/link";
import type { AccountOrderSummary } from "@/db/queries/account";
import { orderStatusLabel } from "@/lib/order-status";
import { formatPaise } from "@/lib/money";
import { ButtonLink } from "@/components/ui/Button";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Shared by the account overview and the full order history. */
export function OrderList({
  orders,
  emptyMessage = "No orders yet.",
}: {
  orders: AccountOrderSummary[];
  emptyMessage?: string;
}) {
  if (orders.length === 0) {
    return (
      <div>
        <p className="text-17 text-ek-green-700">{emptyMessage}</p>
        <ButtonLink href="/products" className="mt-7">
          Browse the shop
        </ButtonLink>
      </div>
    );
  }

  return (
    <ul className="border-t border-ek-green-200">
      {orders.map((order) => (
        <li
          key={order.id}
          className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-ek-green-200 py-5"
        >
          <div>
            <Link
              href={`/orders/${order.id}`}
              className="link-draw font-display text-20 text-ek-green-900"
            >
              #{order.id.slice(-8).toUpperCase()}
            </Link>
            <p className="mt-1 text-15 text-ek-green-700">
              {DATE_FORMAT.format(order.createdAt)} · {order.itemCount} item
              {order.itemCount === 1 ? "" : "s"} ·{" "}
              {orderStatusLabel(order.status)}
            </p>
          </div>
          <p className="text-17 tabular-nums text-ek-green-900">
            {formatPaise(order.totalPaise)}
          </p>
        </li>
      ))}
    </ul>
  );
}
