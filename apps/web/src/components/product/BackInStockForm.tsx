"use client";

import { useId, useRef, useState } from "react";
import { HoneypotField } from "@/components/security/HoneypotField";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";
import { readHoneypot } from "@/lib/honeypot";
import { track } from "@/lib/analytics";

/**
 * Email capture against one out-of-stock pack.
 *
 * Shown instead of the disabled "Out of stock" button doing nothing useful.
 * The wording is the contract and it is kept narrow on purpose: one email,
 * about this pack, and no list. Anything vaguer here would be the shop
 * taking an address under one pretext and using it for another.
 */
export function BackInStockForm({
  variantId,
  packLabel,
  turnstileSiteKey = "",
}: {
  variantId: number;
  packLabel: string;
  turnstileSiteKey?: string;
}) {
  const inputId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;

    setState("sending");
    setMessage("");

    try {
      const response = await fetch("/api/back-in-stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          variantId,
          email: email.trim(),
          turnstileToken: token,
          // Read off the DOM, not from state — the point of the field is
          // that nothing in the page touches it.
          ...(formRef.current
            ? { company_website: readHoneypot(formRef.current) }
            : {}),
        }),
      });

      const data: { message?: string; error?: string } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setState("error");
        setMessage(data.error ?? "That did not go through. Please try again.");
        return;
      }

      setState("done");
      setMessage(data.message ?? "Done — we will write when it is back.");
      track("back_in_stock_requested", { variantId, pack: packLabel });
    } catch {
      setState("error");
      setMessage("That did not go through. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <div
        className="mt-6 border-l-2 border-ek-gold-500 pl-4 text-15 text-ek-green-700"
        aria-live="polite"
      >
        <p className="text-ek-green-900">{message}</p>
        <p className="mt-1.5">
          One email, about the {packLabel} pack. You are not on a mailing list.
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="relative mt-6 border-t border-ek-green-200 pt-6"
    >
      <HoneypotField />

      <label htmlFor={inputId} className="eyebrow block text-ek-green-700">
        Tell me when the {packLabel} is back
      </label>

      <div className="mt-3 flex flex-wrap gap-3">
        <input
          id={inputId}
          type="email"
          name="email"
          required
          autoComplete="email"
          maxLength={200}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="min-h-11 min-w-0 flex-1 border border-ek-green-200 bg-ek-paper px-3 text-17 text-ek-green-900 outline-none focus:border-ek-green-700"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="min-h-11 cursor-pointer border border-ek-green-900 px-5 text-17 text-ek-green-900 transition-colors hover:bg-ek-green-900 hover:text-ek-cream disabled:cursor-not-allowed disabled:opacity-55"
        >
          {state === "sending" ? "Adding…" : "Notify me"}
        </button>
      </div>

      <p className="mt-2.5 text-15 text-ek-green-700">
        One email, the day this pack is back. Nothing else, ever.
      </p>

      {state === "error" && (
        <p className="mt-2.5 text-15 text-ek-terracotta" aria-live="polite">
          {message}
        </p>
      )}

      {turnstileSiteKey && (
        <TurnstileWidget
          siteKey={turnstileSiteKey}
          action="back-in-stock"
          onToken={setToken}
        />
      )}
    </form>
  );
}
