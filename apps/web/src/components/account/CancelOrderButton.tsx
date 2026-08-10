"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Two taps, not one. Cancelling puts stock back and cannot be undone by the
 * customer, so the destructive action is never the thing under their thumb
 * when they arrive.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      const data: { error?: string } = await response.json().catch(() => ({}));
      setError(data.error ?? "We could not cancel that order. Please try again.");
      setConfirming(false);
    } catch {
      setError(
        "We could not reach the site just now. Your order has not changed.",
      );
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div>
        {error && (
          <p role="alert" className="mb-4 text-15 text-ek-terracotta">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="link-draw cursor-pointer text-17 text-ek-green-900"
        >
          Cancel this order
        </button>
      </div>
    );
  }

  return (
    <div className="border border-ek-green-200 bg-ek-gold-100/40 px-5 py-4">
      <p className="text-17 text-ek-green-900">
        Cancel this order for good?
      </p>
      <p className="mt-1.5 max-w-[46ch] text-15 text-ek-green-700">
        We put the stock straight back on sale, so it cannot be undone — you
        would need to order again.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={cancel}
          disabled={busy}
        >
          {busy ? "Cancelling…" : "Yes, cancel it"}
        </Button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="link-draw cursor-pointer text-17 text-ek-green-900 disabled:opacity-55"
        >
          Keep my order
        </button>
      </div>
    </div>
  );
}
