import { configureStore } from "@reduxjs/toolkit";
import { cartReducer } from "./cart-slice";
import { cartListenerMiddleware } from "./cart-persistence";

/** Store factory — a fresh store per request on the server (RSC-safe). */
export function makeStore() {
  return configureStore({
    reducer: {
      cart: cartReducer,
    },
    middleware: (getDefault) =>
      getDefault().prepend(cartListenerMiddleware.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
