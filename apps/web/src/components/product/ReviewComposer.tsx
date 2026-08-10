"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";

/**
 * Writing a review.
 *
 * Eligibility is asked of the server the moment this opens, and the form
 * only appears for someone who can actually submit. Showing the fields to
 * everyone and refusing on submit would waste the effort of anyone who
 * typed a paragraph without a delivered order behind it.
 *
 * Nothing here decides eligibility — it renders what the server said. The
 * POST re-checks it against the session regardless.
 */

type Eligibility =
  | { state: "checking" }
  | { state: "eligible" }
  | { state: "blocked"; reason: string };

const BLOCKED_COPY: Record<string, string> = {
  NO_SESSION:
    "Reviews come from delivered orders, so we need to know which one is yours.",
  NOT_DELIVERED:
    "We can only publish a review once an order containing this product has been delivered to you.",
  ALREADY_REVIEWED:
    "You have already reviewed this from that order. Thank you — it may still be waiting to be read.",
};

export function ReviewComposer({
  productSlug,
  productName,
  onClose,
}: {
  productSlug: string;
  productName: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();

  const [eligibility, setEligibility] = useState<Eligibility>({
    state: "checking",
  });
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/reviews?productSlug=${encodeURIComponent(productSlug)}`)
      .then((response) => response.json())
      .then((data: { eligible?: boolean; reason?: string }) => {
        if (cancelled) return;
        setEligibility(
          data.eligible
            ? { state: "eligible" }
            : { state: "blocked", reason: data.reason ?? "NOT_DELIVERED" },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setEligibility({ state: "blocked", reason: "NOT_DELIVERED" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "sending" || rating === 0) return;

    setStatus("sending");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productSlug, rating, title, body }),
      });
      const data: { message?: string; error?: string } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error ?? "That did not go through. Please try again.");
        return;
      }

      setStatus("done");
      setMessage(data.message ?? "Thank you.");
    } catch {
      setStatus("error");
      setMessage("That did not go through. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <p
        className="border-l-2 border-ek-gold-500 pl-4 text-17 text-ek-green-700"
        aria-live="polite"
      >
        {message}
      </p>
    );
  }

  if (eligibility.state === "checking") {
    return (
      <p className="text-17 text-ek-green-700" aria-live="polite">
        Checking your orders…
      </p>
    );
  }

  if (eligibility.state === "blocked") {
    return (
      <div aria-live="polite">
        <p className="max-w-[60ch] text-17 text-ek-green-700">
          {BLOCKED_COPY[eligibility.reason] ?? BLOCKED_COPY.NOT_DELIVERED}
        </p>
        {eligibility.reason === "NO_SESSION" && (
          <Link
            href="/track"
            className="link-draw mt-3 inline-block text-17 text-ek-gold-800"
          >
            Find your order
          </Link>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 block min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset>
        <legend className="eyebrow text-ek-green-700">
          Your rating of {productName}
        </legend>
        <div className="mt-3 flex gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-pressed={rating === value}
              aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
              className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-sm border transition-colors ${
                value <= rating
                  ? "border-ek-gold-600 text-ek-gold-600"
                  : "border-ek-green-200 text-ek-green-200 hover:border-ek-green-700"
              }`}
            >
              <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
                <path d="M10 1.6l2.5 5.3 5.7.8-4.1 4 1 5.7L10 14.7 4.9 17.4l1-5.7-4.1-4 5.7-.8z" />
              </svg>
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor={titleId} className="eyebrow mt-6 block text-ek-green-700">
        Headline
      </label>
      <input
        id={titleId}
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={120}
        required
        placeholder="In a few words"
        className="mt-2 min-h-11 w-full max-w-lg border border-ek-green-200 bg-ek-paper px-3 text-17 text-ek-green-900 outline-none focus:border-ek-green-700"
      />

      <label htmlFor={bodyId} className="eyebrow mt-5 block text-ek-green-700">
        Your review
      </label>
      <textarea
        id={bodyId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={5}
        maxLength={2000}
        required
        placeholder="How did you use it? How did it compare to what you usually buy?"
        className="mt-2 w-full max-w-lg border border-ek-green-200 bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 outline-none focus:border-ek-green-700"
      />

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "sending" || rating === 0}
          className="min-h-11 cursor-pointer border border-ek-green-900 px-5 text-17 text-ek-green-900 transition-colors hover:bg-ek-green-900 hover:text-ek-cream disabled:cursor-not-allowed disabled:opacity-45"
        >
          {status === "sending" ? "Sending…" : "Submit review"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4"
        >
          Cancel
        </button>
      </div>

      {rating === 0 && (
        <p className="mt-3 text-15 text-ek-green-700">Pick a rating to submit.</p>
      )}
      {status === "error" && (
        <p className="mt-3 text-15 text-ek-terracotta" aria-live="polite">
          {message}
        </p>
      )}
    </form>
  );
}
