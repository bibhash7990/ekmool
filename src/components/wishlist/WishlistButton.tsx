"use client";

import { HeartIcon } from "@/components/icons";
import { toggleWishlist, useWishlist } from "@/lib/wishlist";
import { track } from "@/lib/analytics";

/**
 * Save / unsave. One control, two states — never two controls.
 *
 * Before hydration the list reads empty, so the first paint is always the
 * unsaved heart and it fills in once the store is read. That is a fill
 * change inside a fixed box: no reflow, nothing moves. The alternative —
 * rendering nothing until hydration — would pop a control into the layout
 * and shift the card under the cursor.
 */
export function WishlistButton({
  slug,
  productName,
  variant = "icon",
  className = "",
}: {
  slug: string;
  /** For the accessible name — "Save Mithila Makhana", not "Save". */
  productName: string;
  variant?: "icon" | "inline";
  className?: string;
}) {
  const saved = useWishlist().includes(slug);

  function onClick() {
    const nowSaved = toggleWishlist(slug);
    track(nowSaved ? "wishlist_added" : "wishlist_removed", { slug });
  }

  const label = saved
    ? `Remove ${productName} from your saved list`
    : `Save ${productName} for later`;

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        aria-label={label}
        className={`inline-flex min-h-11 cursor-pointer items-center gap-2 border border-ek-green-200 px-4 text-17 text-ek-green-900 transition-colors hover:border-ek-green-700 ${className}`}
      >
        <HeartIcon
          filled={saved}
          className={`size-5 ${saved ? "text-ek-terracotta" : ""}`}
        />
        <span aria-hidden="true">{saved ? "Saved" : "Save"}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full bg-ek-paper/90 text-ek-green-900 transition-colors hover:text-ek-terracotta ${className}`}
    >
      <HeartIcon
        filled={saved}
        className={`size-5 ${saved ? "text-ek-terracotta" : ""}`}
      />
    </button>
  );
}
