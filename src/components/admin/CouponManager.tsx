"use client";

import { useActionState, useState } from "react";
import {
  createCouponAction,
  toggleCouponAction,
  type ActionResult,
} from "@/app/admin/actions";
import type { CouponSummary } from "@/db/queries/coupons";
import { formatPaise } from "@/lib/money";

const FIELD =
  "min-h-10 w-full border border-ek-green-200 bg-ek-paper px-2 py-1.5 text-15";
const LABEL = "block text-15 text-ek-green-700";

/**
 * Creating a coupon, in rupees.
 *
 * The form takes 150, not 15000. Every money field on this page is rupees
 * and every stored value is paise; asking the owner to think in paise is
 * how a coupon ends up a hundred times too generous, and the conversion
 * belongs in one place — the server action.
 */
export function CouponCreator() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    createCouponAction,
    null,
  );
  const [kind, setKind] = useState<"percent" | "flat" | "free_shipping">(
    "percent",
  );

  return (
    <form action={action} className="mt-6 max-w-3xl">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label htmlFor="code" className={LABEL}>
            Code
          </label>
          <input
            id="code"
            name="code"
            required
            maxLength={40}
            placeholder="HARVEST10"
            className={`${FIELD} tracking-[0.06em] uppercase`}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="description" className={LABEL}>
            What it does — shown to the customer
          </label>
          <input
            id="description"
            name="description"
            required
            maxLength={160}
            placeholder="10% off the harvest"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="kind" className={LABEL}>
            Kind
          </label>
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as typeof kind)
            }
            className={FIELD}
          >
            <option value="percent">Percentage off</option>
            <option value="flat">Flat amount off</option>
            <option value="free_shipping">Free shipping</option>
          </select>
        </div>

        {kind === "percent" && (
          <>
            <div>
              <label htmlFor="percent" className={LABEL}>
                Percent off
              </label>
              <input
                id="percent"
                name="percent"
                type="number"
                min={1}
                max={90}
                step={0.5}
                defaultValue={10}
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="maxDiscountRupees" className={LABEL}>
                Cap the discount at ₹ (optional)
              </label>
              <input
                id="maxDiscountRupees"
                name="maxDiscountRupees"
                type="number"
                min={0}
                step={1}
                placeholder="200"
                className={FIELD}
              />
            </div>
          </>
        )}

        {kind === "flat" && (
          <div>
            <label htmlFor="amountRupees" className={LABEL}>
              Amount off, ₹
            </label>
            <input
              id="amountRupees"
              name="amountRupees"
              type="number"
              min={1}
              step={1}
              defaultValue={100}
              className={FIELD}
            />
          </div>
        )}

        <div>
          <label htmlFor="minSubtotalRupees" className={LABEL}>
            Minimum basket, ₹
          </label>
          <input
            id="minSubtotalRupees"
            name="minSubtotalRupees"
            type="number"
            min={0}
            step={1}
            defaultValue={0}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="endsAt" className={LABEL}>
            Last day (optional)
          </label>
          <input id="endsAt" name="endsAt" type="date" className={FIELD} />
        </div>

        <div>
          <label htmlFor="globalLimit" className={LABEL}>
            Total uses (blank = unlimited)
          </label>
          <input
            id="globalLimit"
            name="globalLimit"
            type="number"
            min={1}
            step={1}
            placeholder="100"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="perCustomerLimit" className={LABEL}>
            Uses per customer
          </label>
          <input
            id="perCustomerLimit"
            name="perCustomerLimit"
            type="number"
            min={1}
            max={100}
            step={1}
            defaultValue={1}
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-10 cursor-pointer bg-ek-green-900 px-4 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create coupon"}
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

export function CouponRow({ coupon }: { coupon: CouponSummary }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    toggleCouponAction,
    null,
  );

  const value =
    coupon.kind === "percent"
      ? `${(coupon.percentBps ?? 0) / 100}% off${
          coupon.maxDiscountPaise
            ? `, max ${formatPaise(coupon.maxDiscountPaise)}`
            : ""
        }`
      : coupon.kind === "flat"
        ? `${formatPaise(coupon.amountPaise ?? 0)} off`
        : "Free shipping";

  return (
    <tr className={`border-b border-ek-green-200 ${coupon.isActive ? "" : "opacity-55"}`}>
      <td className="py-3 pr-4">
        <span className="block text-15 tracking-[0.06em] text-ek-green-900">
          {coupon.code}
        </span>
        <span className="block text-15 text-ek-green-700">
          {coupon.description}
        </span>
      </td>
      <td className="py-3 pr-4 text-15 text-ek-green-700">{value}</td>
      <td className="py-3 pr-4 text-15 text-ek-green-700">
        {coupon.minSubtotalPaise > 0
          ? `over ${formatPaise(coupon.minSubtotalPaise)}`
          : "—"}
      </td>
      <td className="py-3 pr-4 text-15 tabular-nums text-ek-green-700">
        {coupon.redemptions}
        {coupon.globalLimit ? ` / ${coupon.globalLimit}` : ""}
        <span className="block">{formatPaise(coupon.discountGivenPaise)} given</span>
      </td>
      <td className="py-3 pr-4 text-15 text-ek-green-700">
        {coupon.endsAt
          ? new Date(coupon.endsAt).toLocaleDateString("en-IN")
          : "no end date"}
      </td>
      <td className="py-3">
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="id" value={coupon.id} />
          <input
            type="hidden"
            name="active"
            value={coupon.isActive ? "0" : "1"}
          />
          <button
            type="submit"
            disabled={pending}
            className="min-h-10 cursor-pointer border border-ek-green-200 px-3 py-1.5 text-15 text-ek-green-900 transition-colors hover:border-ek-green-700 disabled:opacity-50"
          >
            {coupon.isActive ? "Switch off" : "Switch on"}
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
        </form>
      </td>
    </tr>
  );
}
