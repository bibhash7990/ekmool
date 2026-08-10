"use client";

import { useActionState, useState } from "react";
import {
  createProductAction,
  updateProductAction,
} from "@/app/admin/catalog-actions";
import { GST_RATE_OPTIONS } from "@ekmool/core/gst";
import type { ActionResult } from "@/app/admin/actions";
import type { AdminProduct } from "@/db/queries/catalog-admin";

const FIELD =
  "min-h-11 w-full border border-ek-green-200 bg-ek-paper px-2.5 py-1.5 text-15 text-ek-green-900 outline-none focus:border-ek-green-700";
const LABEL = "block text-15 text-ek-green-700";
const HELP = "mt-1 block text-15 text-ek-green-700";

/**
 * Where Google truncates. Not hard limits — the columns allow a little
 * more, because a 62-character title that reads properly beats a 58 that
 * does not — but the counter turns amber past these so it is a decision
 * rather than an accident.
 */
const TITLE_TARGET = 60;
const DESCRIPTION_TARGET = 160;

function Counter({ length, target }: { length: number; target: number }) {
  const over = length > target;
  return (
    <span
      className={`text-15 tabular-nums ${over ? "text-ek-gold-800" : "text-ek-green-700"}`}
    >
      {length}/{target}
      {over && " — Google will cut this short"}
    </span>
  );
}

export function ProductForm({ product }: { product?: AdminProduct }) {
  const editing = Boolean(product);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    editing ? updateProductAction : createProductAction,
    null,
  );

  const [seoTitle, setSeoTitle] = useState(product?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(
    product?.seoDescription ?? "",
  );

  const slugLocked = Boolean(product && product.references.total > 0);
  const heldBy = product
    ? [
        product.references.orderItems > 0 &&
          `${product.references.orderItems} order line${product.references.orderItems === 1 ? "" : "s"}`,
        product.references.reviews > 0 &&
          `${product.references.reviews} review${product.references.reviews === 1 ? "" : "s"}`,
        product.references.wishlists > 0 &&
          `${product.references.wishlists} wishlist${product.references.wishlists === 1 ? "" : "s"}`,
      ]
        .filter((part): part is string => Boolean(part))
        .join(", ")
    : "";

  return (
    <form action={action} className="mt-6 max-w-4xl">
      {product && <input type="hidden" name="id" value={product.id} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={LABEL}>
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={160}
            defaultValue={product?.name}
            placeholder="Kandhamal Turmeric Powder"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="slug" className={LABEL}>
            Web address
          </label>
          <div className="flex items-center gap-1">
            <span className="shrink-0 text-15 text-ek-green-700">
              /products/
            </span>
            <input
              id="slug"
              name="slug"
              required
              maxLength={120}
              readOnly={slugLocked}
              defaultValue={product?.slug}
              placeholder="kandhamal-turmeric-powder"
              className={`${FIELD} ${slugLocked ? "cursor-not-allowed opacity-60" : ""}`}
            />
          </div>
          <span className={HELP}>
            {slugLocked
              ? `Fixed — ${heldBy} point at it, and the old URL is indexed.`
              : "Lowercase, hyphens, no spaces. It becomes permanent once anyone orders, reviews or saves this."}
          </span>
        </div>

        <div>
          <label htmlFor="originState" className={LABEL}>
            Origin — state
          </label>
          <input
            id="originState"
            name="originState"
            required
            maxLength={80}
            defaultValue={product?.originState}
            placeholder="Odisha"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="giTagName" className={LABEL}>
            GI tag
          </label>
          <input
            id="giTagName"
            name="giTagName"
            required
            maxLength={120}
            defaultValue={product?.giTagName}
            placeholder="Kandhamal Haldi"
            className={FIELD}
          />
          <span className={HELP}>
            The registered name exactly. This is a legal claim about origin,
            not a marketing line.
          </span>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="shortDescription" className={LABEL}>
            Short description
          </label>
          <textarea
            id="shortDescription"
            name="shortDescription"
            required
            rows={2}
            maxLength={400}
            defaultValue={product?.shortDescription}
            className={`${FIELD} min-h-20`}
          />
          <span className={HELP}>
            One or two sentences. This is what appears on the catalogue card.
          </span>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="longDescription" className={LABEL}>
            Full description
          </label>
          <textarea
            id="longDescription"
            name="longDescription"
            required
            rows={8}
            defaultValue={product?.longDescription}
            className={`${FIELD} min-h-48`}
          />
          <span className={HELP}>
            The story on the product page. Blank lines separate paragraphs.
          </span>
        </div>

        <div>
          <label htmlFor="accent" className={LABEL}>
            Accent colour
          </label>
          <select
            id="accent"
            name="accent"
            defaultValue={product?.accent ?? "gold"}
            className={FIELD}
          >
            <option value="gold">Gold</option>
            <option value="terracotta">Terracotta</option>
            <option value="green">Green</option>
          </select>
          <span className={HELP}>
            One of the three brand colours — not a free choice, so the
            catalogue stays one thing.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="hsnCode" className={LABEL}>
              HSN code
            </label>
            <input
              id="hsnCode"
              name="hsnCode"
              inputMode="numeric"
              maxLength={8}
              defaultValue={product?.hsnCode ?? ""}
              placeholder="09103020"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="gstRatePercent" className={LABEL}>
              GST rate
            </label>
            <select
              id="gstRatePercent"
              name="gstRatePercent"
              defaultValue={String((product?.gstRateBps ?? 500) / 100)}
              className={FIELD}
            >
              {GST_RATE_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </div>
          <span className={`${HELP} col-span-2`}>
            Both appear on the tax invoice. Confirm them with your
            accountant — the seeded values are a starting point, not advice.
          </span>
        </div>

        <div className="sm:col-span-2 border-t border-ek-green-200 pt-5">
          <h2 className="eyebrow text-ek-green-700">Search listing</h2>
          <p className="mt-2 max-w-[70ch] text-15 text-ek-green-700">
            Leave both blank and the page falls back to the name and the
            short description, which is usually fine. Fill them in when the
            product needs to rank for something its name does not say.
          </p>

          <div className="mt-4 grid gap-5">
            <div>
              <label htmlFor="seoTitle" className={LABEL}>
                Title tag
              </label>
              <input
                id="seoTitle"
                name="seoTitle"
                maxLength={70}
                value={seoTitle}
                onChange={(event) => setSeoTitle(event.target.value)}
                placeholder="Kandhamal Turmeric Powder — GI-tagged, single origin"
                className={FIELD}
              />
              <span className={HELP}>
                <Counter length={seoTitle.length} target={TITLE_TARGET} />
              </span>
            </div>

            <div>
              <label htmlFor="seoDescription" className={LABEL}>
                Meta description
              </label>
              <textarea
                id="seoDescription"
                name="seoDescription"
                rows={2}
                maxLength={180}
                value={seoDescription}
                onChange={(event) => setSeoDescription(event.target.value)}
                className={`${FIELD} min-h-20`}
              />
              <span className={HELP}>
                <Counter
                  length={seoDescription.length}
                  target={DESCRIPTION_TARGET}
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 cursor-pointer bg-ek-green-900 px-5 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : editing
              ? "Save changes"
              : "Create product"}
        </button>
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
