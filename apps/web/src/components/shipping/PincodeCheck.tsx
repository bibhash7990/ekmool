"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { PinIcon, TruckIcon } from "@/components/icons";
import { createLocalStore, useLocalStore } from "@/lib/local-store";
import type { ServiceabilityResult } from "@/lib/serviceability";

/**
 * "When will it get here?" — asked before the buy decision, not after.
 *
 * The prefix tables stay on the server (see /api/serviceability); this
 * component knows nothing about postal geography, it just asks. What it
 * does remember is the last PIN code the visitor entered, so checking on a
 * product page also answers the question in the cart.
 *
 * Only the PIN code is remembered, never the answer. A cached answer would
 * outlive a change to the zone table and quietly quote a retired estimate;
 * re-asking costs nothing, because the response carries a day-long cache
 * header and the browser serves the repeat from its own disk.
 *
 * The input is uncontrolled on purpose. A remembered PIN code arrives after
 * hydration, and pushing it into React state from an effect means a render
 * with an empty box followed by a render with a full one — the flash that
 * `react-hooks/set-state-in-effect` exists to prevent. `defaultValue` with
 * a `key` lets the DOM hold the value and re-mount when another tab changes
 * it.
 */

const pincodeStore = createLocalStore<string>({
  key: "ekmool.pincode.v1",
  empty: "",
  parse: (raw) => (typeof raw === "string" && /^\d{6}$/.test(raw) ? raw : null),
});

type Status = "idle" | "checking" | "done" | "error";

async function lookup(pincode: string): Promise<ServiceabilityResult> {
  const response = await fetch(
    `/api/serviceability?pincode=${encodeURIComponent(pincode)}`,
  );
  return (await response.json()) as ServiceabilityResult;
}

export function PincodeCheck({ className = "" }: { className?: string }) {
  const inputId = useId();
  const saved = useLocalStore(pincodeStore);
  const inputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ServiceabilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-checks whatever was remembered. Every state update happens in a
  // promise continuation rather than in the effect body, so this
  // synchronises with an external system instead of cascading renders.
  useEffect(() => {
    if (!saved) return;
    let cancelled = false;

    lookup(saved)
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        setStatus("done");
      })
      .catch(() => {
        // Silent: nobody asked for this one. The form is still there.
        if (!cancelled) setStatus("idle");
      });

    return () => {
      cancelled = true;
    };
  }, [saved]);

  // Guards against a slow first response overwriting a faster second one.
  const requestRef = useRef(0);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    const pincode = (inputRef.current?.value ?? "").replace(/\D/g, "").slice(0, 6);
    if (inputRef.current) inputRef.current.value = pincode;

    if (pincode.length !== 6) {
      setStatus("error");
      setResult(null);
      setError("A PIN code is six digits.");
      return;
    }

    const request = (requestRef.current += 1);
    setStatus("checking");
    setError(null);

    try {
      const data = await lookup(pincode);
      if (request !== requestRef.current) return;

      setResult(data);
      setStatus("done");
      if (data.code === "OK") pincodeStore.set(data.pincode);
    } catch {
      if (request !== requestRef.current) return;
      setStatus("error");
      setError(
        "We could not check that just now. Delivery times are on the shipping policy.",
      );
    }
  }

  const ok = status === "done" && result?.code === "OK";

  return (
    <div className={className}>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={inputId} className="eyebrow block text-ek-green-700">
            Delivery to
          </label>
          <div className="mt-2 flex items-center gap-2 border border-ek-green-200 bg-ek-paper px-3 focus-within:border-ek-green-700">
            <PinIcon className="size-[18px] shrink-0 text-ek-green-700" />
            <input
              // Re-mounts when another tab stores a different PIN code,
              // which is the only way an uncontrolled input can follow it.
              key={saved}
              id={inputId}
              ref={inputRef}
              // `text` with inputMode numeric, not `number`: a PIN code is a
              // six-digit label, not a quantity. type=number brings spinners,
              // scroll-wheel edits and a browser that strips leading zeros.
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              defaultValue={saved}
              placeholder="6-digit PIN"
              className="min-h-11 w-28 bg-transparent text-17 tabular-nums text-ek-green-900 outline-none placeholder:text-ek-green-700/70"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={status === "checking"}
          className="min-h-11 cursor-pointer border border-ek-green-900 px-5 text-17 text-ek-green-900 transition-colors hover:bg-ek-green-900 hover:text-ek-cream disabled:cursor-not-allowed disabled:opacity-55"
        >
          {status === "checking" ? "Checking…" : "Check"}
        </button>
      </form>

      {/* Reserved height: the answer must not push the buy button down the
          page the moment it arrives. */}
      <div className="mt-3 min-h-[3.25rem] text-15" aria-live="polite">
        {status === "error" && error && (
          <p className="text-ek-terracotta">{error}</p>
        )}

        {status === "done" && result && !ok && (
          <p className="text-ek-terracotta">{result.message}</p>
        )}

        {ok && result?.zone && (
          <div className="flex gap-2.5 text-ek-green-700">
            <TruckIcon className="mt-0.5 size-[18px] shrink-0 text-ek-green-700" />
            <p>
              <span className="text-ek-green-900">{result.circle}</span> —
              arrives in{" "}
              <span className="text-ek-green-900">
                {result.minDays}–{result.maxDays} working days
              </span>{" "}
              of ordering.{" "}
              <Link href="/shipping-policy" className="link-draw">
                Estimate, not a guarantee
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
