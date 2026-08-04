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
  /** True once localStorage has been read on the client (post-mount). */
  hydrated: boolean;
}

const initialState: CartState = {
  items: [],
  hydrated: false,
};

const MAX_QTY_PER_LINE = 10;

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    cartHydrated(state, action: PayloadAction<CartItem[]>) {
      state.items = action.payload;
      state.hydrated = true;
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
    },
  },
});

export const { cartHydrated, itemAdded, qtySet, itemRemoved, cartCleared } =
  cartSlice.actions;

export const cartReducer = cartSlice.reducer;

/* ---------- Selectors ---------- */

interface RootLike {
  cart: CartState;
}

export const selectCartItems = (s: RootLike) => s.cart.items;
export const selectCartHydrated = (s: RootLike) => s.cart.hydrated;
export const selectCartCount = (s: RootLike) =>
  s.cart.items.reduce((sum, i) => sum + i.qty, 0);
export const selectCartSubtotalPaise = (s: RootLike) =>
  s.cart.items.reduce((sum, i) => sum + i.unitPricePaise * i.qty, 0);
