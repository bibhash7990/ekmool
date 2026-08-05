"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { itemAdded, type CartItem } from "@/store/cart-slice";
import { Button } from "@/components/ui/Button";

interface ReorderLine extends CartItem {
  reducedFrom: number | null;
}

interface ReorderResponse {
  available?: ReorderLine[];
  unavailable?: { label: string; reason: string }[];
  error?: string;
}

/**
 * Puts the order's items back in the cart at today's prices.
 *
 * Anything that cannot come along is named rather than quietly dropped —
 * finding out at the payment screen that your favourite pack is missing is
 * a worse experience than being told here.
 */
export function ReorderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reorder() {
    setBusy(true);
    setError(null);
    setNotes(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/reorder`);
      const data: ReorderResponse = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "We could not rebuild that order. Please try again.");
        return;
      }

      const available = data.available ?? [];
      const unavailable = data.unavailable ?? [];

      for (const line of available) {
        // Built explicitly rather than spread: the cart slice's shape is
        // the contract, and reducedFrom is presentation for this page only.
        dispatch(
          itemAdded({
            variantId: line.variantId,
            sku: line.sku,
            productSlug: line.productSlug,
            productName: line.productName,
            packLabel: line.packLabel,
            unitPricePaise: line.unitPricePaise,
            mrpPaise: line.mrpPaise,
            accent: line.accent,
            qty: line.qty,
          }),
        );
      }

      const messages = [
        ...unavailable.map((line) => `${line.label} — ${line.reason}`),
        ...available
          .filter((line) => line.reducedFrom !== null)
          .map(
            (line) =>
              `${line.productName} · ${line.packLabel} — only ${line.qty} left, so we added that many instead of ${line.reducedFrom}.`,
          ),
      ];

      if (available.length === 0) {
        setNotes(
          messages.length > 0
            ? messages
            : ["Nothing from this order is available at the moment."],
        );
        return;
      }

      if (messages.length > 0) {
        setNotes(messages);
        // Leave them on the page to read why, with the cart already updated.
        router.refresh();
        return;
      }

      router.push("/cart");
    } catch {
      setError("We could not reach the site just now. Your cart has not changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        onClick={reorder}
        disabled={busy}
      >
        {busy ? "Adding…" : "Order this again"}
      </Button>

      {error && (
        <p role="alert" className="mt-3 max-w-[54ch] text-15 text-ek-terracotta">
          {error}
        </p>
      )}

      {notes && (
        <div role="status" className="mt-3 max-w-[54ch]">
          <p className="text-15 text-ek-green-900">
            Added what we could. A note on the rest:
          </p>
          <ul className="mt-1.5 space-y-1 text-15 text-ek-green-700">
            {notes.map((note) => (
              <li key={note}>· {note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
