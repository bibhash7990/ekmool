import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
import {
  cartCleared,
  cartHydrated,
  itemAdded,
  itemRemoved,
  qtySet,
  type CartItem,
} from "./cart-slice";

const STORAGE_KEY = "ekmool.cart.v1";

/** Reads + validates the persisted cart. Safe on any garbage input. */
export function readPersistedCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as CartItem).variantId === "number" &&
        typeof (i as CartItem).unitPricePaise === "number" &&
        typeof (i as CartItem).qty === "number" &&
        (i as CartItem).qty > 0 &&
        typeof (i as CartItem).productSlug === "string" &&
        typeof (i as CartItem).productName === "string",
    );
  } catch {
    return [];
  }
}

/** Persists cart mutations to localStorage (never runs on the server). */
export const cartListenerMiddleware = createListenerMiddleware();

cartListenerMiddleware.startListening({
  matcher: isAnyOf(itemAdded, qtySet, itemRemoved, cartCleared, cartHydrated),
  effect: (_action, api) => {
    if (typeof window === "undefined") return;
    try {
      const state = api.getState() as { cart: { items: CartItem[] } };
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state.cart.items),
      );
    } catch {
      // Storage full/blocked — cart still works in-memory.
    }
  },
});
