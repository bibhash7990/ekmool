"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type FieldErrors = Record<string, string>;

/**
 * Order reference + checkout email. This is the whole sign-in.
 *
 * The reference is the eight characters already printed on the
 * confirmation page and in every email, so a customer who kept either can
 * reach their order without ever having made an account.
 */
export function TrackOrderForm({
  initialReference = "",
  autoFocus = false,
}: {
  initialReference?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [reference, setReference] = useState(initialReference);
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitError) errorRef.current?.focus();
  }, [submitError]);

  function clearFieldError(field: string) {
    setErrors((previous) => {
      if (!previous[field]) return previous;
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setErrors({});
    setSubmitError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/account/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference, email }),
      });

      const data: {
        orderId?: string;
        error?: string;
        retryAfter?: number;
        issues?: { path: string; message: string }[];
      } = await response.json().catch(() => ({}));

      if (response.ok && data.orderId) {
        // The session cookie arrived on this response, so the RSC request
        // router.push makes next already carries it.
        router.push(`/orders/${data.orderId}`);
        return;
      }

      if (response.status === 422 && data.issues) {
        const fieldErrors: FieldErrors = {};
        for (const issue of data.issues) {
          const field = issue.path.split(".").pop();
          if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
        }
        setErrors(fieldErrors);
      } else if (response.status === 429) {
        setSubmitError(
          `Too many attempts. Please wait ${data.retryAfter ?? 60} seconds and try again.`,
        );
      } else {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setSubmitError(
        "We could not reach the site just now. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-sm">
      {submitError && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mb-6 border border-ek-terracotta bg-ek-terracotta/5 px-4 py-3 text-15 text-ek-terracotta"
        >
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="reference" className="block text-15 text-ek-green-700">
          Order reference
        </label>
        <input
          id="reference"
          name="reference"
          value={reference}
          required
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={26}
          placeholder="A1B2C3D4"
          onChange={(event) => {
            setReference(event.target.value.toUpperCase());
            clearFieldError("reference");
          }}
          aria-invalid={errors.reference ? "true" : undefined}
          aria-describedby={
            errors.reference ? "reference-error" : "reference-hint"
          }
          className={`mt-2 min-h-11 w-full border bg-ek-paper px-3 py-2.5 font-mono text-17 tracking-[0.12em] text-ek-green-900 uppercase ${
            errors.reference ? "border-ek-terracotta" : "border-ek-green-200"
          }`}
        />
        {errors.reference ? (
          <p id="reference-error" className="mt-1.5 text-15 text-ek-terracotta">
            {errors.reference}
          </p>
        ) : (
          <p id="reference-hint" className="mt-1.5 text-15 text-ek-green-700">
            The 8 characters after the # on your confirmation.
          </p>
        )}
      </div>

      <div className="mt-6">
        <label htmlFor="lookup-email" className="block text-15 text-ek-green-700">
          Email address
        </label>
        <input
          id="lookup-email"
          name="email"
          type="email"
          value={email}
          required
          autoComplete="email"
          inputMode="email"
          maxLength={200}
          onChange={(event) => {
            setEmail(event.target.value);
            clearFieldError("email");
          }}
          aria-invalid={errors.email ? "true" : undefined}
          aria-describedby={errors.email ? "lookup-email-error" : "lookup-email-hint"}
          className={`mt-2 min-h-11 w-full border bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 ${
            errors.email ? "border-ek-terracotta" : "border-ek-green-200"
          }`}
        />
        {errors.email ? (
          <p id="lookup-email-error" className="mt-1.5 text-15 text-ek-terracotta">
            {errors.email}
          </p>
        ) : (
          <p id="lookup-email-hint" className="mt-1.5 text-15 text-ek-green-700">
            The address you used when you ordered.
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="mt-8 w-full" disabled={submitting}>
        {submitting ? "Checking…" : "Find my order"}
      </Button>
    </form>
  );
}
