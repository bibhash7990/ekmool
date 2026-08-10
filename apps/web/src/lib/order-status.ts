/**
 * Order status vocabulary, shared by server queries and client UI.
 *
 * Lives outside src/db so client components can import the list without
 * dragging mysql2 (and `server-only`) into the browser bundle.
 */

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
];

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as string[]).includes(value);
}

/**
 * Customer-facing wording. The column stores lowercase machine names,
 * which is right for an audit trail and wrong on a page someone reads —
 * "confirmed → packed" is a database row, not a sentence.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Awaiting payment",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/**
 * Return events, which share order_status_history with the order's own
 * statuses under a `return:` prefix.
 *
 * One table and one timeline on purpose. A customer whose parcel arrived
 * damaged should see "Delivered · Return requested · Return approved ·
 * Refunded" as one story, not have to find a second panel elsewhere on the
 * page to learn what happened to their money.
 */
export const RETURN_EVENT_LABEL: Record<string, string> = {
  requested: "Return requested",
  approved: "Return approved",
  received: "Returned parcel received",
  refunded: "Refunded",
  rejected: "Return declined",
};

export function orderStatusLabel(status: string): string {
  if (isOrderStatus(status)) return ORDER_STATUS_LABEL[status];
  // Without this the customer's timeline prints the raw column value —
  // "return:approved" — which is a database row, not a sentence.
  if (status.startsWith("return:")) {
    return RETURN_EVENT_LABEL[status.slice("return:".length)] ?? "Return updated";
  }
  return status;
}
