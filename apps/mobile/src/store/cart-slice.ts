/**
 * Re-export shim, matching `apps/web/src/store/cart-slice.ts` line for line
 * in intent.
 *
 * The reducer, its actions and its selectors are in `@ekmool/core/cart` (D7).
 * The slice is pure state transformation and `@reduxjs/toolkit` is not React,
 * so it lives in the shared package with RTK as an optional peer dependency —
 * two clients, one cart implementation, no drift.
 *
 * The shim exists because the store is this app's composition point: a screen
 * reaching past it into a package to find `itemAdded` would be reaching
 * around the layer that decides what this app's store contains.
 */
export {
  cartCleared,
  cartHydrated,
  cartReducer,
  couponApplied,
  couponCleared,
  itemAdded,
  itemRemoved,
  qtySet,
  selectCartCount,
  selectCartHydrated,
  selectCartItems,
  selectCartSubtotalPaise,
  selectCouponCode,
  type CartItem,
  type CartState,
} from "@ekmool/core/cart";
