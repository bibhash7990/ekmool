"use client";

import { useActionState, useState } from "react";
import { setProductActiveAction } from "@/app/admin/catalog-actions";
import type { ActionResult } from "@/app/admin/actions";

/**
 * Publishing, and pulling it back.
 *
 * Archiving asks first. Publishing does not — putting something on sale is
 * reversible in one click and the checks that matter (a pack exists, a
 * photograph exists) are enforced on the server. Taking a live product off
 * the site is the one that surprises people, so it is the one that
 * confirms.
 */
export function PublishToggle({
  productId,
  isActive,
  name,
}: {
  productId: number;
  isActive: boolean;
  name: string;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    setProductActiveAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  if (isActive && !confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-15 text-ek-green-700">
          Live on the site
        </span>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-11 cursor-pointer border border-ek-green-200 px-4 py-1.5 text-15 text-ek-green-900 transition-colors hover:border-ek-terracotta hover:text-ek-terracotta"
        >
          Take it down
        </button>
        {state && (
          <span
            role="status"
            className={`text-15 ${state.ok ? "text-ek-green-700" : "text-ek-terracotta"}`}
          >
            {state.message}
          </span>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="active" value={isActive ? "0" : "1"} />

      {isActive && (
        <span className="text-15 text-ek-green-900">
          Take {name} off the site?
        </span>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`min-h-11 cursor-pointer px-4 py-1.5 text-15 transition-colors disabled:opacity-50 ${
          isActive
            ? "border border-ek-terracotta text-ek-terracotta hover:bg-ek-terracotta hover:text-ek-cream"
            : "bg-ek-green-900 text-ek-cream hover:bg-ek-green-700"
        }`}
      >
        {pending
          ? "Saving…"
          : isActive
            ? "Yes, take it down"
            : "Publish this product"}
      </button>

      {isActive && (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4"
        >
          Leave it up
        </button>
      )}

      {state && (
        <span
          role="status"
          className={`text-15 ${state.ok ? "text-ek-green-700" : "text-ek-terracotta"}`}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}
