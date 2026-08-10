/**
 * Re-export shim. The implementation is in @ekmool/core/order-status.
 *
 * Kept for one reason that is not import count: scripts/test-admin.mjs does
 * `await import("@/lib/order-status")` through the `@/` resolve hook in
 * scripts/alias-loader.mjs, and that hook only knows how to find files under
 * apps/web/src. Deleting this file breaks a test suite from outside the
 * directory this change is allowed to touch.
 */
export {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  RETURN_EVENT_LABEL,
  isOrderStatus,
  orderStatusLabel,
  type OrderStatus,
  type PaymentStatus,
} from "@ekmool/core/order-status";
