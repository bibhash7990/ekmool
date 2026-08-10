import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import {
  CART_STORAGE_KEY,
  createCartPersistence,
  parseCartItems,
  parsePersistedCart,
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
} from "./cart-slice";

/**
 * The browser half of cart persistence. The key, the wire shape and the
 * validation live in @ekmool/core/cart/persistence; what is left here is
 * localStorage and the v1 migration, neither of which means anything off the
 * web.
 *
 * v2 stores `{ items, couponCode }`; v1 stored a bare array of items.
 * Both are read, so a cart left in a tab before that change survives —
 * silently emptying somebody's basket to simplify a migration is not a
 * trade worth making for two lines of code.
 */
const LEGACY_KEY = "ekmool.cart.v1";

export type { PersistedCart };

/**
 * The legacy sweep lives in `write`, not beside the read, so that it happens
 * exactly when the v2 key has just been written successfully — the ordering
 * the previous version had inside its try block. Sweeping on read instead
 * would delete v1 before anything had replaced it.
 */
const localStorageCart: CartStorage = {
  async read() {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  },
  async write(value) {
    window.localStorage.setItem(CART_STORAGE_KEY, value);
    // The v1 key would otherwise sit there for ever, and be read again by
    // any older tab still running the previous bundle.
    window.localStorage.removeItem(LEGACY_KEY);
  },
};

const persistence = createCartPersistence(localStorageCart);

/**
 * Reads + validates the persisted cart. Safe on any garbage input.
 *
 * Synchronous, and not `persistence.read()`, on purpose. StoreProvider
 * dispatches this from its mount effect; awaiting a promise there would push
 * hydration into a later microtask and give the cart badge a frame in which
 * it reads zero with items in the basket. The shared parser does the work
 * either way — only the await is skipped.
 */
export function readPersistedCart(): PersistedCart {
  if (typeof window === "undefined") return { items: [], couponCode: null };

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (raw) return parsePersistedCart(raw);

    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      return { items: parseCartItems(JSON.parse(legacy)), couponCode: null };
    }
  } catch {
    // Corrupt or blocked storage — start empty rather than throw.
  }

  return { items: [], couponCode: null };
}

/** Persists cart mutations to localStorage (never runs on the server). */
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
    if (typeof window === "undefined") return;
    const state = api.getState() as {
      cart: { items: CartItem[]; couponCode: string | null };
    };
    void persistence
      .write({
        items: state.cart.items,
        couponCode: state.cart.couponCode,
      })
      // Storage full/blocked — cart still works in-memory. Caught here rather
      // than in core: an unhandled rejection would reach Sentry as an error
      // on every keystroke in a private-mode tab.
      .catch(() => {});
  },
});
