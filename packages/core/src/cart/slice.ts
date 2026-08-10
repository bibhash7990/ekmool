import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * The single Redux slice. Scope: cart + checkout UI state ONLY.
 * Server data (products, orders) never lives here — it arrives as
 * RSC props; the cart snapshots what the buyer picked.
 */

export interface CartItem {
  variantId: number;
  sku: string;
  productSlug: string;
  productName: string;
  packLabel: string;
  unitPricePaise: number;
  mrpPaise: number;
  accent: "gold" | "terracotta" | "green";
  qty: number;
}

export interface CartState {
  items: CartItem[];
  /**
   * The code the customer typed, and only the code.
   *
   * What it is worth is never kept here. A stored discount goes stale the
   * moment the basket changes or someone else claims the last use, and a
   * cart showing a saving the checkout will not honour is worse than one
   * that asks again. The cart re-quotes it against the server; checkout
   * decides it for real.
   */
  couponCode: string | null;
  /** True once localStorage has been read on the client (post-mount). */
  hydrated: boolean;
}

const initialState: CartState = {
  items: [],
  couponCode: null,
  hydrated: false,
};

const MAX_QTY_PER_LINE = 10;

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    cartHydrated(
      state,
      action: PayloadAction<{ items: CartItem[]; couponCode: string | null }>,
    ) {
      state.items = action.payload.items;
      state.couponCode = action.payload.couponCode;
      state.hydrated = true;
    },
    couponApplied(state, action: PayloadAction<string>) {
      state.couponCode = action.payload.trim().toUpperCase();
    },
    couponCleared(state) {
      state.couponCode = null;
    },
    itemAdded(state, action: PayloadAction<CartItem>) {
      const existing = state.items.find(
        (i) => i.variantId === action.payload.variantId,
      );
      if (existing) {
        existing.qty = Math.min(
          existing.qty + action.payload.qty,
          MAX_QTY_PER_LINE,
        );
      } else {
        state.items.push({
          ...action.payload,
          qty: Math.min(action.payload.qty, MAX_QTY_PER_LINE),
        });
      }
    },
    qtySet(state, action: PayloadAction<{ variantId: number; qty: number }>) {
      const item = state.items.find(
        (i) => i.variantId === action.payload.variantId,
      );
      if (!item) return;
      const qty = Math.floor(action.payload.qty);
      if (qty <= 0) {
        state.items = state.items.filter(
          (i) => i.variantId !== action.payload.variantId,
        );
      } else {
        item.qty = Math.min(qty, MAX_QTY_PER_LINE);
      }
    },
    itemRemoved(state, action: PayloadAction<number>) {
      state.items = state.items.filter((i) => i.variantId !== action.payload);
    },
    cartCleared(state) {
      state.items = [];
      // A code applies to a basket. Emptying the basket ends it.
      state.couponCode = null;
    },
  },
});

export const {
  cartHydrated,
  itemAdded,
  qtySet,
  itemRemoved,
  cartCleared,
  couponApplied,
  couponCleared,
} = cartSlice.actions;

export const cartReducer = cartSlice.reducer;

/* ---------- Selectors ---------- */

interface RootLike {
  cart: CartState;
}

export const selectCartItems = (s: RootLike) => s.cart.items;
export const selectCartHydrated = (s: RootLike) => s.cart.hydrated;
export const selectCouponCode = (s: RootLike) => s.cart.couponCode;
export const selectCartCount = (s: RootLike) =>
  s.cart.items.reduce((sum, i) => sum + i.qty, 0);
export const selectCartSubtotalPaise = (s: RootLike) =>
  s.cart.items.reduce((sum, i) => sum + i.unitPricePaise * i.qty, 0);
