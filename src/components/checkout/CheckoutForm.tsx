"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  cartCleared,
  selectCartHydrated,
  selectCartItems,
  selectCartSubtotalPaise,
} from "@/store/cart-slice";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SoilLine } from "@/components/ui/SoilLine";
import { formatPaise } from "@/lib/money";
import {
  FREE_SHIPPING_THRESHOLD_PAISE,
  FLAT_SHIPPING_PAISE,
} from "@/lib/constants";
import { checkoutSchema, INDIAN_STATE_OPTIONS } from "@/lib/validation/checkout";
import { track } from "@/lib/analytics";
import { HONEYPOT_FIELD, readHoneypot } from "@/lib/honeypot";
import { HoneypotField } from "@/components/security/HoneypotField";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: () => void;
  modal: { ondismiss: () => void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

type FieldErrors = Record<string, string>;

/**
 * crypto.randomUUID needs a secure context; fall back so checkout still
 * works over plain http (local network testing, staging without TLS).
 */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `ek-${random}`;
}

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  notes: "",
};

export function CheckoutForm({
  razorpayEnabled,
  turnstileSiteKey = "",
}: {
  razorpayEnabled: boolean;
  /** Empty unless Turnstile is configured, in which case no widget renders. */
  turnstileSiteKey?: string;
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const hydrated = useAppSelector(selectCartHydrated);
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartSubtotalPaise);

  const [form, setForm] = useState(EMPTY_FORM);
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "razorpay">("cod");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);

  /**
   * One key per checkout attempt, minted on first submit. Retrying after
   * a network wobble reuses it, so a request that actually succeeded
   * server-side cannot produce a second order. Cleared after a terminal
   * failure so a corrected resubmission is a genuinely new attempt.
   */
  const idempotencyKeyRef = useRef<string | null>(null);
  function currentIdempotencyKey(): string {
    idempotencyKeyRef.current ??= newIdempotencyKey();
    return idempotencyKeyRef.current;
  }

  const shipping = useMemo(
    () => (subtotal >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : FLAT_SHIPPING_PAISE),
    [subtotal],
  );
  const total = subtotal + shipping;

  useEffect(() => {
    if (submitError) errorRef.current?.focus();
  }, [submitError]);

  /**
   * Prefill from the signed-in customer's saved default address.
   *
   * Fetched rather than rendered in: /checkout is statically generated, and
   * reading a cookie during its render would turn every checkout view into
   * an origin request. The endpoint answers `{ address: null }` with no
   * database work when there is no session, so a guest pays almost nothing
   * for it and the guest flow is otherwise untouched.
   *
   * Only fills fields that are still empty — it can never overwrite
   * something already typed.
   */
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    let cancelled = false;

    void fetch("/api/account/default-address")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          data: {
            address?: Record<string, string>;
            customer?: Record<string, string>;
          } | null,
        ) => {
          if (cancelled || !data?.address) return;
          setForm((current) => {
            const next = { ...current };
            const fill = (field: keyof typeof EMPTY_FORM, value?: string) => {
              if (!next[field] && value) next[field] = value;
            };
            fill("name", data.customer?.name);
            fill("email", data.customer?.email);
            fill("phone", data.customer?.phone);
            fill("line1", data.address?.line1);
            fill("line2", data.address?.line2);
            fill("city", data.address?.city);
            fill("state", data.address?.state);
            fill("pincode", data.address?.pincode);
            fill("landmark", data.address?.landmark);
            return next;
          });
          setPrefilled(true);
        },
      )
      .catch(() => {
        // Prefill is a convenience; a failure is not worth telling anyone.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function update(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  }

  function buildPayload() {
    return {
      customer: {
        name: form.name,
        email: form.email,
        phone: form.phone,
      },
      address: {
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        landmark: form.landmark,
      },
      paymentMethod,
      items: items.map((i) => ({ variantId: i.variantId, qty: i.qty })),
      notes: form.notes,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    // Captured before any await: React nulls currentTarget once the handler
    // returns, and this is read after the fetch has begun.
    const honeypot = readHoneypot(event.currentTarget);

    // Validate client-side with the exact schema the server uses.
    const parsed = checkoutSchema.safeParse(buildPayload());
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[issue.path.length - 1];
        if (typeof field === "string" && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
      first?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": currentIdempotencyKey(),
        },
        body: JSON.stringify({
          ...parsed.data,
          turnstileToken,
          [HONEYPOT_FIELD]: honeypot,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // A rejected attempt must not reuse its key, or a corrected
        // resubmission would replay the failed one. A 503 keeps its key:
        // the request may have committed before the DB became unreachable.
        if (response.status !== 503) idempotencyKeyRef.current = null;
        setSubmitError(
          data.error ?? "Something went wrong. Please try again.",
        );
        if (data.code === "VALIDATION_FAILED" && Array.isArray(data.issues)) {
          const fieldErrors: FieldErrors = {};
          for (const issue of data.issues) {
            const field = String(issue.path).split(".").pop();
            if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
          }
          setErrors(fieldErrors);
        }
        if (data.code === "INSUFFICIENT_STOCK" || data.code === "UNKNOWN_VARIANT") {
          track("payment_failed", { reason: data.code });
        }
        setSubmitting(false);
        return;
      }

      if (data.paymentMethod === "razorpay" && data.razorpayOrderId) {
        openRazorpay(data);
        return;
      }

      track("purchase_completed", {
        value: total / 100,
        orderId: data.orderId,
        method: "cod",
      });
      dispatch(cartCleared());
      router.push(`/order/${data.orderId}/confirmed`);
    } catch {
      setSubmitError(
        "We could not reach our servers. Your cart is safe — please check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  function openRazorpay(data: {
    orderId: string;
    razorpayOrderId: string;
    razorpayKeyId: string;
    totalPaise: number;
  }) {
    if (!window.Razorpay) {
      setSubmitError(
        "The payment window could not load. Please try Cash on Delivery, or refresh and retry.",
      );
      setSubmitting(false);
      return;
    }

    const checkout = new window.Razorpay({
      key: data.razorpayKeyId,
      amount: data.totalPaise,
      currency: "INR",
      name: "Ekmool",
      description: "Single-origin Indian foods",
      order_id: data.razorpayOrderId,
      prefill: {
        name: form.name,
        email: form.email,
        contact: form.phone,
      },
      theme: { color: "#1C3A2D" },
      handler: () => {
        track("purchase_completed", {
          value: data.totalPaise / 100,
          orderId: data.orderId,
          method: "razorpay",
        });
        dispatch(cartCleared());
        router.push(`/order/${data.orderId}/confirmed`);
      },
      modal: {
        ondismiss: () => {
          track("payment_failed", { reason: "dismissed" });
          setSubmitError(
            "Payment was not completed. Your order is saved — you can retry, or place it as Cash on Delivery.",
          );
          setSubmitting(false);
        },
      },
    });

    checkout.open();
  }

  if (!hydrated) {
    return (
      <p className="text-17 text-ek-green-700" aria-busy="true">
        Loading your cart…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        <p className="max-w-[46ch] text-20 text-ek-green-700">
          There is nothing to check out — your cart is empty.
        </p>
        <ButtonLink href="/products" size="lg" className="mt-8">
          Browse the shop
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      {razorpayEnabled && (
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      )}

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid gap-12 lg:grid-cols-[1.3fr_0.7fr] lg:gap-16"
      >
        <div>
          {submitError && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="mb-8 border-l-2 border-ek-terracotta bg-ek-gold-100 px-5 py-4 text-17 text-ek-green-900"
            >
              {submitError}
            </div>
          )}

          {prefilled && (
            <p
              role="status"
              className="mb-6 border-l-2 border-ek-gold-500 bg-ek-gold-100/50 px-5 py-3 text-15 text-ek-green-900"
            >
              Filled in from your saved details. Change anything that has
              moved — it will not affect the address on file.
            </p>
          )}

          <fieldset className="border-0 p-0">
            <legend className="eyebrow text-ek-green-700">
              Contact details
            </legend>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field
                id="name"
                label="Full name"
                autoComplete="name"
                value={form.name}
                error={errors.name}
                onChange={(v) => update("name", v)}
                className="sm:col-span-2"
              />
              <Field
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                hint="Your receipt and tracking updates go here."
                value={form.email}
                error={errors.email}
                onChange={(v) => update("email", v)}
              />
              <Field
                id="phone"
                label="Mobile number"
                type="tel"
                autoComplete="tel-national"
                inputMode="numeric"
                maxLength={10}
                hint="10 digits, for delivery calls."
                value={form.phone}
                error={errors.phone}
                onChange={(v) => update("phone", v.replace(/\D/g, ""))}
              />
            </div>
          </fieldset>

          <SoilLine align="left" className="my-10 max-w-[10rem]" />

          <fieldset className="border-0 p-0">
            <legend className="eyebrow text-ek-green-700">
              Delivery address
            </legend>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field
                id="line1"
                label="Address"
                autoComplete="address-line1"
                value={form.line1}
                error={errors.line1}
                onChange={(v) => update("line1", v)}
                className="sm:col-span-2"
              />
              <Field
                id="line2"
                label="Apartment, floor (optional)"
                autoComplete="address-line2"
                required={false}
                value={form.line2}
                error={errors.line2}
                onChange={(v) => update("line2", v)}
                className="sm:col-span-2"
              />
              <Field
                id="city"
                label="City"
                autoComplete="address-level2"
                value={form.city}
                error={errors.city}
                onChange={(v) => update("city", v)}
              />
              <div>
                <label
                  htmlFor="state"
                  className="block text-15 text-ek-green-700"
                >
                  State
                </label>
                <select
                  id="state"
                  name="state"
                  autoComplete="address-level1"
                  value={form.state}
                  onChange={(e) => update("state", e.target.value)}
                  aria-invalid={errors.state ? "true" : undefined}
                  aria-describedby={errors.state ? "state-error" : undefined}
                  className={`mt-2 min-h-11 w-full cursor-pointer border bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 ${
                    errors.state ? "border-ek-terracotta" : "border-ek-green-200"
                  }`}
                >
                  <option value="">Select a state</option>
                  {INDIAN_STATE_OPTIONS.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
                {errors.state && (
                  <p id="state-error" className="mt-1.5 text-15 text-ek-terracotta">
                    {errors.state}
                  </p>
                )}
              </div>
              <Field
                id="pincode"
                label="PIN code"
                autoComplete="postal-code"
                inputMode="numeric"
                maxLength={6}
                value={form.pincode}
                error={errors.pincode}
                onChange={(v) => update("pincode", v.replace(/\D/g, ""))}
              />
              <Field
                id="landmark"
                label="Landmark (optional)"
                required={false}
                value={form.landmark}
                error={errors.landmark}
                onChange={(v) => update("landmark", v)}
              />
            </div>
          </fieldset>

          <SoilLine align="left" className="my-10 max-w-[10rem]" />

          <fieldset className="border-0 p-0">
            <legend className="eyebrow text-ek-green-700">Payment</legend>
            <div className="mt-6 space-y-3">
              <PaymentOption
                id="cod"
                checked={paymentMethod === "cod"}
                onSelect={() => setPaymentMethod("cod")}
                title="Cash on Delivery"
                description="Pay the courier when your order arrives. Available across India."
              />
              {razorpayEnabled ? (
                <PaymentOption
                  id="razorpay"
                  checked={paymentMethod === "razorpay"}
                  onSelect={() => setPaymentMethod("razorpay")}
                  title="Pay online"
                  description="UPI, cards, net banking and wallets via Razorpay."
                />
              ) : (
                <p className="border border-dashed border-ek-green-200 px-5 py-4 text-15 text-ek-green-700">
                  Online payment is coming soon. Cash on Delivery is available
                  everywhere we ship.
                </p>
              )}
            </div>
          </fieldset>
        </div>

        <aside aria-labelledby="checkout-summary" className="lg:pt-2">
          <h2 id="checkout-summary" className="eyebrow text-ek-green-700">
            Order summary
          </h2>
          <SoilLine align="left" className="mt-5 max-w-[12rem]" />

          <ul className="mt-6 space-y-4 border-b border-ek-green-200 pb-5">
            {items.map((item) => (
              <li key={item.variantId} className="flex justify-between gap-4">
                <span className="min-w-0 text-15 text-ek-green-700">
                  {item.productName}
                  <span className="block">
                    {item.packLabel} × {item.qty}
                  </span>
                </span>
                <span className="text-15 tabular-nums text-ek-green-900">
                  {formatPaise(item.unitPricePaise * item.qty)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-3 text-17">
            <div className="flex justify-between gap-4">
              <dt className="text-ek-green-700">Subtotal</dt>
              <dd className="tabular-nums">{formatPaise(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ek-green-700">Shipping</dt>
              <dd className="tabular-nums">
                {shipping === 0 ? "Free" : formatPaise(shipping)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-ek-green-200 pt-3 text-20 font-semibold text-ek-green-900">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatPaise(total)}</dd>
            </div>
          </dl>

          <HoneypotField />

          {turnstileSiteKey && (
            <TurnstileWidget
              siteKey={turnstileSiteKey}
              action="checkout"
              onToken={setTurnstileToken}
            />
          )}

          <Button
            type="submit"
            size="lg"
            className="mt-7 w-full"
            disabled={submitting}
          >
            {submitting
              ? "Placing your order…"
              : paymentMethod === "cod"
                ? `Place order · ${formatPaise(total)}`
                : `Pay ${formatPaise(total)}`}
          </Button>

          <p className="mt-4 text-15 text-ek-green-700">
            By placing this order you agree to our{" "}
            <Link href="/terms" className="link-draw">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/refund-policy" className="link-draw">
              refund policy
            </Link>
            .
          </p>
        </aside>
      </form>
    </>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = "text",
  autoComplete,
  inputMode,
  maxLength,
  required = true,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "numeric" | "tel";
  maxLength?: number;
  required?: boolean;
  className?: string;
}) {
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-15 text-ek-green-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        className={`mt-2 min-h-11 w-full border bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 ${
          error ? "border-ek-terracotta" : "border-ek-green-200"
        }`}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-15 text-ek-green-700">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-15 text-ek-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

function PaymentOption({
  id,
  checked,
  onSelect,
  title,
  description,
}: {
  id: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer gap-4 border px-5 py-4 transition-colors ${
        checked
          ? "border-ek-green-900 bg-ek-gold-100/40"
          : "border-ek-green-200 hover:border-ek-green-700"
      }`}
    >
      <input
        type="radio"
        id={id}
        name="paymentMethod"
        value={id}
        checked={checked}
        onChange={onSelect}
        className="mt-1.5 size-4 shrink-0 accent-ek-green-900"
      />
      <span>
        <span className="block text-17 text-ek-green-900">{title}</span>
        <span className="mt-1 block text-15 text-ek-green-700">
          {description}
        </span>
      </span>
    </label>
  );
}
