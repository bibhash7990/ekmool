import { useSyncExternalStore } from "react";

/**
 * A tiny localStorage-backed store shaped for `useSyncExternalStore`.
 *
 * Three features need the same four things — read on the client only,
 * survive a reload, stay in step across tabs, and not break hydration — so
 * they share one implementation rather than three near-copies: the
 * wishlist, recently-viewed, and the last PIN code someone checked.
 *
 * Why not just read localStorage in an effect: setting state from an effect
 * on mount renders the empty state first, then the real one, which flashes;
 * React's own lint rule objects to it for that reason. `useSyncExternalStore`
 * gets it right by construction and buys cross-tab sync on the way past.
 *
 * The one rule that makes this work: `get()` must return a referentially
 * stable value when nothing has changed, or React re-renders forever. Hence
 * the raw-string cache — the parse only re-runs when the stored text
 * actually differs.
 */

export interface LocalStore<T> {
  /** Client snapshot. Stable between writes. */
  get(): T;
  set(value: T): void;
  clear(): void;
  subscribe(onChange: () => void): () => void;
  /** Server + first-paint snapshot. Always the same reference. */
  getServerSnapshot(): T;
}

export function createLocalStore<T>(options: {
  /** localStorage key. Namespaced `ekmool.` by convention. */
  key: string;
  /**
   * Value used on the server, before hydration, and whenever the stored
   * text is missing or unusable. Must be a constant — it is returned by
   * reference.
   */
  empty: T;
  /** Validates whatever was stored. Return null to fall back to `empty`. */
  parse: (raw: unknown) => T | null;
}): LocalStore<T> {
  const { key, empty, parse } = options;
  const eventName = `ek:${key}`;

  let cachedRaw: string | null = null;
  let cachedValue: T = empty;
  let primed = false;
  /**
   * Set when storage refuses a write — private browsing, quota, a locked-
   * down profile. From then on the store is in-memory: the feature keeps
   * working for the rest of the visit and simply does not survive a reload,
   * which is a far better failure than a heart that will not stay filled.
   */
  let memoryOnly = false;

  function read(): T {
    if (typeof window === "undefined") return empty;
    if (memoryOnly) return cachedValue;

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      memoryOnly = true;
      return cachedValue;
    }

    if (primed && raw === cachedRaw) return cachedValue;

    cachedRaw = raw;
    primed = true;

    if (!raw) {
      cachedValue = empty;
      return cachedValue;
    }

    try {
      cachedValue = parse(JSON.parse(raw)) ?? empty;
    } catch {
      cachedValue = empty;
    }
    return cachedValue;
  }

  function announce(): void {
    window.dispatchEvent(new Event(eventName));
  }

  return {
    get: read,

    set(value: T) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        cachedRaw = null;
        primed = false;
      } catch {
        memoryOnly = true;
        cachedValue = value;
      }
      announce();
    },

    clear() {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(key);
        cachedRaw = null;
        primed = false;
      } catch {
        memoryOnly = true;
      }
      cachedValue = empty;
      announce();
    },

    subscribe(onChange: () => void) {
      if (typeof window === "undefined") return () => {};
      const invalidate = () => {
        primed = false;
        onChange();
      };
      // Same tab: our own event. Other tabs: the storage event, which the
      // browser only fires at *other* documents — which is why both are
      // needed and neither is redundant.
      window.addEventListener(eventName, invalidate);
      window.addEventListener("storage", invalidate);
      return () => {
        window.removeEventListener(eventName, invalidate);
        window.removeEventListener("storage", invalidate);
      };
    },

    getServerSnapshot: () => empty,
  };
}

/** Subscribes a component to a store. */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(
    store.subscribe,
    store.get,
    store.getServerSnapshot,
  );
}
