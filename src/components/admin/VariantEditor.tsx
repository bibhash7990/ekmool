"use client";

import { useActionState, useState } from "react";
import {
  saveVariantAction,
  setVariantActiveAction,
} from "@/app/admin/catalog-actions";
import type { ActionResult } from "@/app/admin/actions";
import type { AdminVariant } from "@/db/queries/catalog-admin";
import { formatPaise, paiseToRupees } from "@/lib/money";

const FIELD =
  "min-h-11 w-full border border-ek-green-200 bg-ek-paper px-2.5 py-1.5 text-15 text-ek-green-900 outline-none focus:border-ek-green-700";
const LABEL = "block text-15 text-ek-green-700";

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <span
      role="status"
      className={`text-15 ${state.ok ? "text-ek-green-700" : "text-ek-terracotta"}`}
    >
      {state.message}
    </span>
  );
}

/**
 * The pack fields, shared by the add form and every edit form.
 *
 * Money is in rupees here and paise in the database, and the conversion
 * lives in the server action — the same rule the coupon forms follow, for
 * the same reason.
 */
function VariantFields({
  variant,
  includeStock,
}: {
  variant?: AdminVariant;
  includeStock?: boolean;
}) {
  const prefix = variant ? `v${variant.id}` : "new";

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor={`${prefix}-sku`} className={LABEL}>
          SKU
        </label>
        <input
          id={`${prefix}-sku`}
          name="sku"
          required
          maxLength={64}
          defaultValue={variant?.sku}
          placeholder="EK-KTP-100"
          className={`${FIELD} uppercase tracking-[0.04em]`}
        />
      </div>

      <div>
        <label htmlFor={`${prefix}-label`} className={LABEL}>
          Pack size, as shown
        </label>
        <input
          id={`${prefix}-label`}
          name="packSizeLabel"
          required
          maxLength={40}
          defaultValue={variant?.packSizeLabel}
          placeholder="100 g"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor={`${prefix}-grams`} className={LABEL}>
          Net weight, grams
        </label>
        <input
          id={`${prefix}-grams`}
          name="packSizeGrams"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={variant?.packSizeGrams}
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor={`${prefix}-price`} className={LABEL}>
          Selling price, ₹
        </label>
        <input
          id={`${prefix}-price`}
          name="priceRupees"
          type="number"
          min={1}
          step="0.01"
          required
          defaultValue={variant ? paiseToRupees(variant.pricePaise) : undefined}
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor={`${prefix}-mrp`} className={LABEL}>
          MRP, ₹
        </label>
        <input
          id={`${prefix}-mrp`}
          name="mrpRupees"
          type="number"
          min={1}
          step="0.01"
          required
          defaultValue={variant ? paiseToRupees(variant.mrpPaise) : undefined}
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor={`${prefix}-threshold`} className={LABEL}>
          Warn me below
        </label>
        <input
          id={`${prefix}-threshold`}
          name="lowStockThreshold"
          type="number"
          min={0}
          step={1}
          defaultValue={variant?.lowStockThreshold ?? 10}
          className={FIELD}
        />
      </div>

      {includeStock && (
        <div>
          <label htmlFor={`${prefix}-stock`} className={LABEL}>
            Opening stock
          </label>
          <input
            id={`${prefix}-stock`}
            name="stockQty"
            type="number"
            min={0}
            step={1}
            defaultValue={0}
            className={FIELD}
          />
        </div>
      )}
    </div>
  );
}

export function VariantCreator({ productId }: { productId: number }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveVariantAction,
    null,
  );
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 min-h-11 cursor-pointer border border-ek-green-900 px-4 py-1.5 text-15 text-ek-green-900 transition-colors hover:bg-ek-green-900 hover:text-ek-cream"
      >
        Add a pack
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-6 border border-ek-green-200 bg-ek-cream p-5"
    >
      <input type="hidden" name="productId" value={productId} />
      <h3 className="font-display text-20 text-ek-green-900">A new pack</h3>
      <div className="mt-4">
        <VariantFields includeStock />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 cursor-pointer bg-ek-green-900 px-4 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add pack"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4 hover:text-ek-gold-800"
        >
          Cancel
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

/**
 * One pack: its numbers at a glance, its editor behind a button.
 *
 * Collapsed by default because a product with three packs would otherwise
 * open as eighteen input fields, and the common case — checking a price —
 * needs none of them.
 *
 * Stock is shown here and edited on the Stock page. Not an oversight: a
 * restock from zero has to wake everyone on the back-in-stock list, and
 * that only happens on the path that reads the previous value under the
 * lock it writes. A stock field here would look identical and quietly
 * strand them.
 */
export function VariantRow({
  productId,
  variant,
}: {
  productId: number;
  variant: AdminVariant;
}) {
  const [saveState, saveAction, saving] = useActionState<
    ActionResult | null,
    FormData
  >(saveVariantAction, null);
  const [archiveState, archiveAction, archiving] = useActionState<
    ActionResult | null,
    FormData
  >(setVariantActiveAction, null);
  const [open, setOpen] = useState(false);

  const discount =
    variant.mrpPaise > variant.pricePaise
      ? Math.round(
          ((variant.mrpPaise - variant.pricePaise) / variant.mrpPaise) * 100,
        )
      : 0;

  return (
    <div
      className={`border-b border-ek-green-200 py-4 last:border-b-0 ${
        variant.isActive ? "" : "opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-17 text-ek-green-900">
            {variant.packSizeLabel}
            <span className="ml-2 text-15 tracking-[0.04em] text-ek-green-700">
              {variant.sku}
            </span>
            {!variant.isActive && (
              <span className="ml-2 text-15 text-ek-terracotta">archived</span>
            )}
          </p>
          <p className="mt-1 text-15 text-ek-green-700">
            {formatPaise(variant.pricePaise)}
            {discount > 0 && (
              <>
                {" "}
                <span className="line-through">
                  {formatPaise(variant.mrpPaise)}
                </span>{" "}
                · {discount}% off
              </>
            )}{" "}
            · {variant.packSizeGrams} g ·{" "}
            <span className="tabular-nums">{variant.stockQty}</span> in stock
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="min-h-11 cursor-pointer border border-ek-green-200 px-3 py-1.5 text-15 text-ek-green-900 transition-colors hover:border-ek-green-700"
          >
            {open ? "Close" : "Edit"}
          </button>

          <form action={archiveAction} className="flex items-center gap-2">
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="variantId" value={variant.id} />
            <input
              type="hidden"
              name="active"
              value={variant.isActive ? "0" : "1"}
            />
            <button
              type="submit"
              disabled={archiving}
              className="min-h-11 cursor-pointer border border-ek-green-200 px-3 py-1.5 text-15 text-ek-green-900 transition-colors hover:border-ek-green-700 disabled:opacity-50"
            >
              {variant.isActive ? "Archive" : "Restore"}
            </button>
          </form>
        </div>
      </div>

      {archiveState && (
        <p className="mt-2">
          <Status state={archiveState} />
        </p>
      )}

      {open && (
        <form
          action={saveAction}
          className="mt-4 border-t border-ek-green-200 pt-4"
        >
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="variantId" value={variant.id} />
          <VariantFields variant={variant} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 cursor-pointer bg-ek-green-900 px-4 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save pack"}
            </button>
            <Status state={saveState} />
          </div>
        </form>
      )}
    </div>
  );
}
