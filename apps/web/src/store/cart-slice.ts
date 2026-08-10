/**
 * Re-export shim. The reducer, its actions and its selectors are in
 * @ekmool/core/cart — the slice is pure state transformation, and
 * @reduxjs/toolkit is not React, so it can live in a shared package with RTK
 * as an optional peer dependency.
 *
 * Kept because nine modules in this app import `@/store/cart-slice`, and
 * because the store is the app's own composition point: a component reaching
 * past it into a package to find `itemAdded` would be reaching around the
 * layer that decides what this app's store contains.
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
