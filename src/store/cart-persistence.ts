import { createListenerMiddleware, isAnyOf } from "@reduxjs/toolkit";
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
 * v2 stores `{ items, couponCode }`; v1 stored a bare array of items.
 * Both are read, so a cart left in a tab before this change survives —
 * silently emptying somebody's basket to simplify a migration is not a
 * trade worth making for two lines of code.
 */
const STORAGE_KEY = "ekmool.cart.v2";
const LEGACY_KEY = "ekmool.cart.v1";

export interface PersistedCart {
  items: CartItem[];
  couponCode: string | null;
}

function parseItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
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
}

/** Reads + validates the persisted cart. Safe on any garbage input. */
export function readPersistedCart(): PersistedCart {
  if (typeof window === "undefined") return { items: [], couponCode: null };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const record = (parsed ?? {}) as Record<string, unknown>;
      const code = record.couponCode;
      return {
        items: parseItems(record.items),
        // Re-validated on read: a hand-edited store must not put arbitrary
        // text into a request body, and the code is re-quoted anyway.
        couponCode:
          typeof code === "string" && /^[A-Z0-9-]{3,40}$/.test(code)
            ? code
            : null,
      };
    }

    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      return { items: parseItems(JSON.parse(legacy)), couponCode: null };
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
    try {
      const state = api.getState() as {
        cart: { items: CartItem[]; couponCode: string | null };
      };
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          items: state.cart.items,
          couponCode: state.cart.couponCode,
        }),
      );
      // The v1 key would otherwise sit there for ever, and be read again by
      // any older tab still running the previous bundle.
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Storage full/blocked — cart still works in-memory.
    }
  },
});
