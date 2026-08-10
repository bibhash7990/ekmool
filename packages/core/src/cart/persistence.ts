import type { CartItem } from "./slice.ts";

/**
 * The storage-independent half of cart persistence.
 *
 * The web writes the cart to `localStorage`, which does not exist in React
 * Native, so the writing does not move. What moves is everything that is not
 * the writing: the key, the wire shape, and the validation that turns a
 * string somebody could have hand-edited into a cart the reducer will accept.
 *
 * Sharing the key is the point. A future cart-shape migration — a v3 — is
 * then written once, here, and every client gets it. Two clients each with
 * their own key and their own parser is two migrations, and the second one is
 * written six months later by someone reading the first one wrong.
 *
 * This does **not** mean carts sync between devices. There is no account, so
 * there is nothing to sync them under; two devices are two carts.
 */

/**
 * v2 stores `{ items, couponCode }`; v1 stored a bare array of items.
 *
 * The value is load-bearing and must not be "tidied". Changing this string
 * does not migrate anything — it silently empties the basket of every
 * customer who has one, and they find out at the moment they came back to
 * pay.
 */
export const CART_STORAGE_KEY = "ekmool.cart.v2";

export interface PersistedCart {
  items: CartItem[];
  couponCode: string | null;
}

/**
 * Where a persisted cart is read from and written to.
 *
 * Async because the phone's storage is async — `expo-sqlite/kv-store` returns
 * promises and `localStorage` does not. A synchronous interface would have
 * been the smaller lie only until the second implementation.
 *
 * The adapter owns the key, rather than being handed one, so that a client
 * with a migration to run (the web has a v1 key to sweep up) can do it inside
 * its own adapter instead of widening this interface for everybody.
 */
export interface CartStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

/** Accepts only lines the reducer and the checkout request can both use. */
export function parseCartItems(value: unknown): CartItem[] {
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

const EMPTY_CART: PersistedCart = { items: [], couponCode: null };

/**
 * Parses a stored v2 payload. Never throws: corrupt, truncated or
 * hand-written storage yields an empty cart, because the alternative is an
 * exception thrown during hydration on a page the customer can then not use
 * at all.
 */
export function parsePersistedCart(raw: string | null): PersistedCart {
  if (!raw) return { ...EMPTY_CART };
  try {
    const parsed: unknown = JSON.parse(raw);
    const record = (parsed ?? {}) as Record<string, unknown>;
    const code = record.couponCode;
    return {
      items: parseCartItems(record.items),
      // Re-validated on read: a hand-edited store must not put arbitrary
      // text into a request body, and the code is re-quoted anyway.
      couponCode:
        typeof code === "string" && /^[A-Z0-9-]{3,40}$/.test(code)
          ? code
          : null,
    };
  } catch {
    return { ...EMPTY_CART };
  }
}

/** The v2 payload, exactly as `parsePersistedCart` expects to read it back. */
export function serialisePersistedCart(cart: PersistedCart): string {
  return JSON.stringify({ items: cart.items, couponCode: cart.couponCode });
}

/**
 * Binds the parsing above to a storage implementation.
 *
 * `write` deliberately does not swallow a failure. Full or blocked storage
 * means the cart lives only in memory, and whether that is worth telling
 * anyone about is a decision for the client — the web has always ignored it,
 * and a shared default of "ignore" would take that choice away from the next
 * one.
 */
export function createCartPersistence(storage: CartStorage): {
  read(): Promise<PersistedCart>;
  write(cart: PersistedCart): Promise<void>;
} {
  return {
    async read() {
      return parsePersistedCart(await storage.read());
    },
    async write(cart) {
      await storage.write(serialisePersistedCart(cart));
    },
  };
}
