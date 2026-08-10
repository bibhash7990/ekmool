"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  updateOrderStatusAction,
  type ActionResult,
} from "@/app/admin/actions";
// Value import must come from the client-safe module: @/db/queries/admin
// pulls in mysql2 and would land in the browser bundle.
import { ORDER_STATUSES } from "@/lib/order-status";
import type { AdminOrderRow } from "@/db/queries/admin";
import { formatPaise } from "@/lib/money";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_TONE: Record<string, string> = {
  pending: "bg-ek-gold-100 text-ek-green-900",
  confirmed: "bg-ek-green-200 text-ek-green-900",
  packed: "bg-ek-green-200 text-ek-green-900",
  shipped: "bg-ek-green-900 text-ek-cream",
  delivered: "bg-ek-green-700 text-ek-cream",
  cancelled: "bg-ek-terracotta/15 text-ek-terracotta",
};

export function OrderRow({ order }: { order: AdminOrderRow }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateOrderStatusAction,
    null,
  );

  return (
    <tr className="border-b border-ek-green-200 align-top">
      <td className="py-4 pr-4">
        <span className="font-mono text-15 text-ek-green-900">
          {order.id.slice(-8).toUpperCase()}
        </span>
        <span className="mt-1 block text-15 text-ek-green-700">
          {DATE_FORMAT.format(order.createdAt)}
        </span>
      </td>

      <td className="py-4 pr-4">
        <span className="block text-15 text-ek-green-900">
          {order.customerName}
        </span>
        <span className="block text-15 text-ek-green-700">
          {order.customerEmail}
        </span>
        <span className="block text-15 text-ek-green-700">
          {order.city}, {order.state} {order.pincode}
        </span>
      </td>

      <td className="py-4 pr-4 whitespace-nowrap">
        <span className="block text-15 tabular-nums text-ek-green-900">
          {formatPaise(order.totalPaise)}
        </span>
        <span className="block text-15 text-ek-green-700">
          {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
        </span>
        <span className="block text-15 text-ek-green-700">
          {order.paymentMethod === "cod" ? "COD" : "Online"} ·{" "}
          {order.paymentStatus}
        </span>
      </td>

      <td className="py-4 pr-4">
        <span
          className={`inline-block rounded-sm px-2 py-1 text-15 leading-none ${
            STATUS_TONE[order.status] ?? "bg-ek-green-200"
          }`}
        >
          {order.status}
        </span>
      </td>

      <td className="py-4">
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="orderId" value={order.id} />

          <div>
            <label
              htmlFor={`status-${order.id}`}
              className="block text-[13px] text-ek-green-700"
            >
              Status
            </label>
            <select
              id={`status-${order.id}`}
              name="status"
              defaultValue={order.status}
              className="mt-1 min-h-10 cursor-pointer border border-ek-green-200 bg-ek-paper px-2 py-1.5 text-15"
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`tracking-${order.id}`}
              className="block text-[13px] text-ek-green-700"
            >
              Tracking id
            </label>
            <input
              id={`tracking-${order.id}`}
              name="trackingId"
              type="text"
              defaultValue={order.trackingId ?? ""}
              placeholder="courier AWB"
              className="mt-1 min-h-10 w-36 border border-ek-green-200 bg-ek-paper px-2 py-1.5 text-15"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="min-h-10 cursor-pointer bg-ek-green-900 px-3.5 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          {state && (
            <p
              role="status"
              className={`w-full text-15 ${
                state.ok ? "text-ek-green-700" : "text-ek-terracotta"
              }`}
            >
              {state.message}
            </p>
          )}
        </form>

        <Link
          href={`/order/${order.id}/confirmed`}
          className="link-draw mt-2 inline-block text-15 text-ek-green-700"
        >
          View customer receipt
        </Link>
      </td>
    </tr>
  );
}
