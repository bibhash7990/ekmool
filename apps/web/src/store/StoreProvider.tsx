"use client";

import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { makeStore } from "./store";
import { cartHydrated } from "./cart-slice";
import { readPersistedCart } from "./cart-persistence";

/**
 * Client boundary for Redux. The store is created once per mounted tree
 * (and per request during SSR) via a lazy useState initializer. The cart
 * hydrates from localStorage AFTER mount, so server HTML always shows the
 * empty-cart state — no hydration mismatch.
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(makeStore);

  useEffect(() => {
    store.dispatch(cartHydrated(readPersistedCart()));
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
