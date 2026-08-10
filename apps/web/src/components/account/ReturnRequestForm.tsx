"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export interface ReturnReasonOption {
  value: string;
  label: string;
  windowHours: number;
  help: string;
}

/**
 * The return form is a rendering of /refund-policy, not a free-text
 * complaint box. Each reason carries its own window and its own caveat, so
 * a customer reads what applies to their case before they type — rather
 * than writing three paragraphs and being told afterwards that opened food
 * cannot go back.
 */
export function ReturnRequestForm({
  orderId,
  reasons,
}: {
  orderId: string;
  reasons: ReturnReasonOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(reasons[0]?.value ?? "");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = reasons.find((r) => r.value === reason);

  if (!open) {
    return (
      <div>
        {error && (
          <p role="alert" className="mb-4 max-w-[54ch] text-15 text-ek-terracotta">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="link-draw cursor-pointer text-17 text-ek-green-900"
        >
          Something wrong with this order?
        </button>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setFieldError(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/return`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, detail }),
      });

      if (response.ok) {
        router.refresh();
        return;
      }

      const data: {
        error?: string;
        issues?: { path: string; message: string }[];
      } = await response.json().catch(() => ({}));

      if (response.status === 422 && data.issues?.length) {
        setFieldError(data.issues[0].message);
      } else {
        setError(data.error ?? "We could not open that request. Please try again.");
        setOpen(false);
      }
    } catch {
      setError("We could not reach the site just now. Nothing has changed.");
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-xl border border-ek-green-200 bg-ek-gold-100/40 px-5 py-5"
    >
      <h3 className="font-display text-20 text-ek-green-900">
        Tell us what went wrong
      </h3>

      <fieldset className="mt-5 border-0 p-0">
        <legend className="sr-only">Reason for return</legend>
        <div className="space-y-3">
          {reasons.map((option) => (
            <label
              key={option.value}
              htmlFor={`reason-${option.value}`}
              className="flex cursor-pointer items-start gap-3"
            >
              <input
                id={`reason-${option.value}`}
                type="radio"
                name="reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="mt-1.5 size-4 shrink-0 accent-ek-green-900"
              />
              <span>
                <span className="block text-17 text-ek-green-900">
                  {option.label}
                </span>
                <span className="block text-15 text-ek-green-700">
                  Within{" "}
                  {option.windowHours <= 48
                    ? `${option.windowHours} hours`
                    : `${option.windowHours / 24} days`}{" "}
                  of delivery
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {selected && (
        <p className="mt-4 max-w-[52ch] text-15 text-ek-green-700">
          {selected.help}
        </p>
      )}

      <div className="mt-5">
        <label htmlFor="return-detail" className="block text-15 text-ek-green-700">
          What happened?
        </label>
        <textarea
          id="return-detail"
          name="detail"
          rows={4}
          value={detail}
          required
          maxLength={1000}
          onChange={(event) => {
            setDetail(event.target.value);
            setFieldError(null);
          }}
          aria-invalid={fieldError ? "true" : undefined}
          aria-describedby={fieldError ? "return-detail-error" : undefined}
          className={`mt-2 w-full border bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 ${
            fieldError ? "border-ek-terracotta" : "border-ek-green-200"
          }`}
        />
        {fieldError && (
          <p id="return-detail-error" className="mt-1.5 text-15 text-ek-terracotta">
            {fieldError}
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send request"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="link-draw cursor-pointer text-17 text-ek-green-900"
        >
          Never mind
        </button>
      </div>

      <p className="mt-5 text-15 text-ek-green-700">
        The full rules are on our{" "}
        <Link href="/refund-policy" className="link-draw text-ek-green-900">
          refund policy
        </Link>{" "}
        page. We reply to every request.
      </p>
    </form>
  );
}
