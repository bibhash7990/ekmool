"use client";

import { useActionState } from "react";
import { updateProfileAction, type ActionResult } from "@/app/account/actions";
import { Button } from "@/components/ui/Button";

export function ProfileForm({
  email,
  name,
  phone,
  marketingOptIn,
}: {
  email: string;
  name: string;
  phone: string;
  marketingOptIn: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateProfileAction,
    null,
  );

  return (
    <form action={action} className="max-w-sm">
      <div>
        <label htmlFor="profile-name" className="block text-15 text-ek-green-700">
          Full name
        </label>
        <input
          id="profile-name"
          name="name"
          defaultValue={name}
          required
          autoComplete="name"
          maxLength={160}
          aria-invalid={state?.errors?.name ? "true" : undefined}
          aria-describedby={state?.errors?.name ? "profile-name-error" : undefined}
          className={`mt-2 min-h-11 w-full border bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 ${
            state?.errors?.name ? "border-ek-terracotta" : "border-ek-green-200"
          }`}
        />
        {state?.errors?.name && (
          <p id="profile-name-error" className="mt-1.5 text-15 text-ek-terracotta">
            {state.errors.name}
          </p>
        )}
      </div>

      <div className="mt-6">
        <label htmlFor="profile-phone" className="block text-15 text-ek-green-700">
          Mobile number
        </label>
        <input
          id="profile-phone"
          name="phone"
          defaultValue={phone}
          required
          autoComplete="tel-national"
          inputMode="numeric"
          maxLength={10}
          aria-invalid={state?.errors?.phone ? "true" : undefined}
          aria-describedby={
            state?.errors?.phone ? "profile-phone-error" : "profile-phone-hint"
          }
          className={`mt-2 min-h-11 w-full border bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 ${
            state?.errors?.phone ? "border-ek-terracotta" : "border-ek-green-200"
          }`}
        />
        {state?.errors?.phone ? (
          <p id="profile-phone-error" className="mt-1.5 text-15 text-ek-terracotta">
            {state.errors.phone}
          </p>
        ) : (
          <p id="profile-phone-hint" className="mt-1.5 text-15 text-ek-green-700">
            Couriers call this number. Most missed deliveries are missed calls.
          </p>
        )}
      </div>

      <div className="mt-6">
        <label htmlFor="profile-email" className="block text-15 text-ek-green-700">
          Email address
        </label>
        <input
          id="profile-email"
          value={email}
          readOnly
          disabled
          aria-describedby="profile-email-hint"
          className="mt-2 min-h-11 w-full border border-ek-green-200 bg-ek-green-200/25 px-3 py-2.5 text-17 text-ek-green-900"
        />
        <p id="profile-email-hint" className="mt-1.5 text-15 text-ek-green-700">
          This is how your orders are matched to you, so it is not editable
          here. Ordered under another address? Look that order up and it
          becomes the account you are in.
        </p>
      </div>

      <label
        htmlFor="profile-marketing"
        className="mt-8 flex cursor-pointer items-start gap-3"
      >
        <input
          id="profile-marketing"
          name="marketingOptIn"
          type="checkbox"
          defaultChecked={marketingOptIn}
          className="mt-1 size-4 shrink-0 accent-ek-green-900"
        />
        <span className="text-15 text-ek-green-700">
          Email me when a harvest lands or something is back in stock. A few
          times a year, never more, and one click to stop.
        </span>
      </label>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {state && (
          <span
            role="status"
            className={`text-15 ${
              state.ok ? "text-ek-green-700" : "text-ek-terracotta"
            }`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
