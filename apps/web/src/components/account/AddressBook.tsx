"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  saveAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  type ActionResult,
} from "@/app/account/actions";
import type { CustomerAddress } from "@/db/queries/customers";
import { INDIAN_STATE_OPTIONS } from "@ekmool/contracts/checkout";
import { ADDRESS_LABEL_SUGGESTIONS } from "@ekmool/contracts/account";
import { Button } from "@/components/ui/Button";

/**
 * Add, edit, delete and choose a default. One address is being edited at a
 * time — an inline form under the card, rather than a modal, so the page
 * still works with JavaScript slow to arrive and there is no focus trap to
 * get wrong.
 */
export function AddressBook({
  addresses,
  atLimit,
}: {
  addresses: CustomerAddress[];
  atLimit: boolean;
}) {
  const [editing, setEditing] = useState<number | "new" | null>(
    addresses.length === 0 ? "new" : null,
  );

  // Stable identity so AddressForm's "collapse when saved" effect keys on
  // the action state and nothing else.
  const stopEditing = useCallback(() => setEditing(null), []);

  return (
    <div>
      <ul className="border-t border-ek-green-200">
        {addresses.map((address) => (
          <li key={address.id} className="border-b border-ek-green-200 py-5">
            {editing === address.id ? (
              <AddressForm address={address} onDone={stopEditing} />
            ) : (
              <AddressCard
                address={address}
                onEdit={() => setEditing(address.id)}
              />
            )}
          </li>
        ))}
      </ul>

      {editing === "new" ? (
        <div className="mt-8">
          {/* The very first address has nothing to collapse back to, so it
              gets no Cancel and stays open. */}
          <AddressForm
            onDone={addresses.length === 0 ? undefined : stopEditing}
          />
        </div>
      ) : (
        <div className="mt-8">
          <Button
            type="button"
            variant="secondary"
            disabled={atLimit}
            onClick={() => setEditing("new")}
          >
            Add an address
          </Button>
          {atLimit && (
            <p className="mt-3 text-15 text-ek-green-700">
              You have reached the limit. Delete one you no longer use to add
              another.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddressCard({
  address,
  onEdit,
}: {
  address: CustomerAddress;
  onEdit: () => void;
}) {
  const [defaultState, setDefaultAction, settingDefault] = useActionState<
    ActionResult | null,
    FormData
  >(setDefaultAddressAction, null);
  const [deleteState, deleteAction, deleting] = useActionState<
    ActionResult | null,
    FormData
  >(deleteAddressAction, null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const error =
    (defaultState && !defaultState.ok && defaultState.message) ||
    (deleteState && !deleteState.ok && deleteState.message) ||
    null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
      <div>
        <p className="text-17 text-ek-green-900">
          {address.label}
          {address.isDefault && (
            <span className="ml-3 bg-ek-gold-100 px-2 py-0.5 text-15 text-ek-gold-800">
              Default
            </span>
          )}
        </p>
        <address className="mt-2 text-15 leading-relaxed text-ek-green-700 not-italic">
          {address.line1}
          {address.line2 && (
            <>
              <br />
              {address.line2}
            </>
          )}
          <br />
          {address.city}, {address.state} {address.pincode}
          {/* "Landmark: X", not "Near X" — people write "Opposite the
              temple" or "Behind the school", and prefixing that reads
              wrong. */}
          {address.landmark && (
            <>
              <br />
              Landmark: {address.landmark}
            </>
          )}
        </address>
        {error && (
          <p role="alert" className="mt-2 text-15 text-ek-terracotta">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {!address.isDefault && (
          <form action={setDefaultAction}>
            <input type="hidden" name="addressId" value={address.id} />
            <button
              type="submit"
              disabled={settingDefault}
              className="link-draw cursor-pointer text-15 text-ek-green-900 disabled:opacity-55"
            >
              {settingDefault ? "Setting…" : "Make default"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="link-draw cursor-pointer text-15 text-ek-green-900"
        >
          Edit
        </button>

        {confirmingDelete ? (
          <form action={deleteAction} className="flex items-center gap-4">
            <input type="hidden" name="addressId" value={address.id} />
            <button
              type="submit"
              disabled={deleting}
              className="link-draw cursor-pointer text-15 text-ek-terracotta disabled:opacity-55"
            >
              {deleting ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="link-draw cursor-pointer text-15 text-ek-green-700"
            >
              Keep
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="link-draw cursor-pointer text-15 text-ek-green-700"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function AddressForm({
  address,
  onDone,
}: {
  address?: CustomerAddress;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveAddressAction,
    null,
  );

  // Collapse back to the card once the server confirms the save. `state`
  // only changes identity when the action returns, and onDone comes from a
  // useCallback in the parent, so this fires exactly once per save.
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={action} className="max-w-xl">
      {address && <input type="hidden" name="addressId" value={address.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="label"
          label="Name this address"
          defaultValue={address?.label ?? ADDRESS_LABEL_SUGGESTIONS[0]}
          error={state?.errors?.label}
          maxLength={40}
          list="address-label-suggestions"
        />
        <datalist id="address-label-suggestions">
          {ADDRESS_LABEL_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>

        <Field
          id="line1"
          label="Address"
          defaultValue={address?.line1 ?? ""}
          error={state?.errors?.line1}
          autoComplete="address-line1"
          maxLength={200}
          className="sm:col-span-2"
        />
        <Field
          id="line2"
          label="Apartment, floor (optional)"
          defaultValue={address?.line2 ?? ""}
          error={state?.errors?.line2}
          autoComplete="address-line2"
          maxLength={200}
          required={false}
          className="sm:col-span-2"
        />
        <Field
          id="city"
          label="City"
          defaultValue={address?.city ?? ""}
          error={state?.errors?.city}
          autoComplete="address-level2"
          maxLength={100}
        />

        <div>
          <label htmlFor="state" className="block text-15 text-ek-green-700">
            State
          </label>
          <select
            id="state"
            name="state"
            required
            defaultValue={address?.state ?? ""}
            autoComplete="address-level1"
            aria-invalid={state?.errors?.state ? "true" : undefined}
            className={`mt-2 min-h-11 w-full border bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 ${
              state?.errors?.state ? "border-ek-terracotta" : "border-ek-green-200"
            }`}
          >
            <option value="" disabled>
              Select a state
            </option>
            {INDIAN_STATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {state?.errors?.state && (
            <p className="mt-1.5 text-15 text-ek-terracotta">
              {state.errors.state}
            </p>
          )}
        </div>

        <Field
          id="pincode"
          label="PIN code"
          defaultValue={address?.pincode ?? ""}
          error={state?.errors?.pincode}
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={6}
        />
        <Field
          id="landmark"
          label="Landmark (optional)"
          defaultValue={address?.landmark ?? ""}
          error={state?.errors?.landmark}
          maxLength={200}
          required={false}
        />
      </div>

      <label
        htmlFor="isDefault"
        className="mt-6 flex cursor-pointer items-center gap-3"
      >
        <input
          id="isDefault"
          name="isDefault"
          type="checkbox"
          defaultChecked={address?.isDefault ?? false}
          className="size-4 shrink-0 accent-ek-green-900"
        />
        <span className="text-15 text-ek-green-700">
          Use this one at checkout
        </span>
      </label>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : address ? "Save changes" : "Save address"}
        </Button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="link-draw cursor-pointer text-17 text-ek-green-900"
          >
            Cancel
          </button>
        )}
        {state && !state.ok && (
          <span role="alert" className="text-15 text-ek-terracotta">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  defaultValue,
  error,
  autoComplete,
  inputMode,
  maxLength,
  required = true,
  className = "",
  list,
}: {
  id: string;
  label: string;
  defaultValue: string;
  error?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric";
  maxLength?: number;
  required?: boolean;
  className?: string;
  list?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-15 text-ek-green-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        defaultValue={defaultValue}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        list={list}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`mt-2 min-h-11 w-full border bg-ek-paper px-3 py-2.5 text-17 text-ek-green-900 ${
          error ? "border-ek-terracotta" : "border-ek-green-200"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-15 text-ek-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}
