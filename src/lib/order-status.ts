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

export function orderStatusLabel(status: string): string {
  return isOrderStatus(status) ? ORDER_STATUS_LABEL[status] : status;
}
