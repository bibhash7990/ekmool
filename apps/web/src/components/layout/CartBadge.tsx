"use client";

import Link from "next/link";
import { useAppSelector } from "@/store/hooks";
import { selectCartCount, selectCartHydrated } from "@/store/cart-slice";
import { CartIcon } from "@/components/icons";

/**
 * The count renders only after hydration, so server HTML and the first
 * client paint agree (the persisted cart lives in localStorage).
 */
export function CartBadge() {
  const hydrated = useAppSelector(selectCartHydrated);
  const count = useAppSelector(selectCartCount);
  const showCount = hydrated && count > 0;

  return (
    <Link
      href="/cart"
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center text-ek-green-900 transition-colors hover:text-ek-green-700"
      aria-label={showCount ? `Cart, ${count} items` : "Cart"}
    >
      <CartIcon className="size-6" />
      {showCount && (
        <span className="absolute top-1 right-0.5 flex size-5 items-center justify-center rounded-full bg-ek-gold-500 text-[11px] leading-none font-semibold text-ek-green-950 tabular-nums">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
