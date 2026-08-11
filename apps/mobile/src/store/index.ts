import { configureStore } from "@reduxjs/toolkit";

import { cartHydrated, cartReducer } from "@/store/cart-slice";
import {
  cartListenerMiddleware,
  readPersistedCart,
} from "@/store/cart-persistence";

/**
 * The store. Scope: the cart, and nothing else.
 *
 * Server data does not live here. The catalogue, reviews and content arrive
 * through `useCachedDocument`, which owns their freshness; copying them into
 * Redux would create a second copy with a second lifetime and no ETag.
 *
 * **A module-level singleton, not a factory.** The web needs `makeStore()`
 * because it renders on the server and a shared store would leak one
 * request's cart into another's HTML. A phone is one process, one customer,
 * and no server rendering, so a factory here would buy nothing and would cost
 * the thing below: hydration can start at import time, which is before any
 * screen has mounted, so the cart badge never renders a zero it then corrects.
 */
export const store = configureStore({
  reducer: {
    cart: cartReducer,
  },
  middleware: (getDefault) =>
    getDefault().prepend(cartListenerMiddleware.middleware),
});

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

/**
 * The typed hooks, re-exported so a screen imports the store and its hooks
 * from one place.
 *
 * They are defined in ./hooks.ts rather than here because they need
 * `RootState` and `AppDispatch`, which are derived from the store above —
 * defining them in this file would be a circular import in the one direction
 * TypeScript cannot untangle. The split is mechanical; the seam should not
 * be visible to a screen, hence this line.
 */
export { useAppDispatch, useAppSelector } from "./hooks";

/**
 * Reads the saved cart and dispatches it.
 *
 * Exported so a test can run it deliberately, and started here so nothing has
 * to remember to. `selectCartHydrated` is false until it lands, which is what
 * an empty-cart screen should check before saying the basket is empty — the
 * difference between "you have not added anything" and "we have not looked
 * yet" is a sentence the customer can tell apart.
 */
export function hydrateCart(): Promise<void> {
  return readPersistedCart().then((cart) => {
    store.dispatch(cartHydrated(cart));
  });
}

void hydrateCart();
