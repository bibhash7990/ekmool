import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import { Storage } from "expo-sqlite/kv-store";
import {
  CART_STORAGE_KEY,
  createCartPersistence,
  type CartStorage,
  type PersistedCart,
} from "@ekmool/core/cart/persistence";

import {
  cartCleared,
  cartHydrated,
  couponApplied,
  couponCleared,
  itemAdded,
  itemRemoved,
  qtySet,
  type CartItem,
} from "@/store/cart-slice";

/**
 * The phone's half of cart persistence.
 *
 * The key, the wire shape and the validation are in
 * `@ekmool/core/cart/persistence`. What is left here is `expo-sqlite/kv-store`
 * and nothing else — which is the point of the `CartStorage` interface: a
 * future v3 cart migration is written once, in the package, and both clients
 * get it.
 *
 * **`CART_STORAGE_KEY` is imported, never retyped.** It is `ekmool.cart.v2`
 * today. `v1` is the legacy key the web reads once and migrates from; on the
 * web, *writing* to it would silently empty the basket of every customer who
 * has one, and a phone that picked the wrong one would be inconsistent with
 * the site for no reason at all. This app has no legacy sweep because this
 * app has never written a v1 key — there was no mobile client when v1 existed.
 *
 * SecureStore is not used, deliberately. A cart is what somebody picked off a
 * shelf; it is worth nothing to anyone and it changes on every tap. The
 * session token is the thing in the keystore. See `src/lib/session.ts`.
 */
const kvCartStorage: CartStorage = {
  read: () => Storage.getItemAsync(CART_STORAGE_KEY),
  write: (value) => Storage.setItemAsync(CART_STORAGE_KEY, value),
};

const persistence = createCartPersistence(kvCartStorage);

export type { PersistedCart };

/**
 * Reads and validates the persisted cart. Safe on any garbage input — the
 * shared parser returns an empty cart rather than throwing, because the
 * alternative is an exception during hydration on a screen the customer can
 * then not use at all.
 *
 * Asynchronous, unlike the web's, and the difference is not a preference:
 * `localStorage` is synchronous and `kv-store` is not for reads that have to
 * open the database. The synchronous `getItemSync` exists and is used for the
 * catalogue documents, where it buys the first frame; here it would buy a
 * badge count one tick earlier at the cost of a SQLite open on the launch
 * path, which is the trade in the wrong direction.
 */
export function readPersistedCart(): Promise<PersistedCart> {
  return persistence.read().catch(() => ({ items: [], couponCode: null }));
}

/** Persists every cart mutation. */
export const cartListenerMiddleware = createListenerMiddleware();

cartListenerMiddleware.startListening({
  matcher: isAnyOf(
    itemAdded,
    qtySet,
    itemRemoved,
    cartCleared,
    cartHydrated,
    couponApplied,
    couponCleared,
  ),
  effect: (_action, api) => {
    const state = api.getState() as {
      cart: { items: CartItem[]; couponCode: string | null };
    };
    void persistence
      .write({
        items: state.cart.items,
        couponCode: state.cart.couponCode,
      })
      // Full or unwritable storage — the cart still works in memory for this
      // session. Caught here rather than in the package, which deliberately
      // does not swallow it, so that each client decides whether it cares.
      // This one does not: an unhandled rejection on every quantity tap is a
      // worse outcome than a cart that does not survive a force-quit.
      .catch(() => {});
  },
});
