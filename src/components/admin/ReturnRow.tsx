"use client";

import { useActionState, useState } from "react";
import { decideReturnAction } from "@/app/admin/actions";
import type { ActionResult } from "@/app/admin/actions";
import type { QueuedReturn, ReturnStatus } from "@/db/queries/returns";
import { formatPaise } from "@/lib/money";

const STAMP = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const DECISION_LABEL: Record<string, string> = {
  approved: "Approve — ask them to send it back",
  rejected: "Decline",
  received: "The parcel has arrived",
  refunded: "Refunded",
};

/**
 * One return, and the decisions available from where it currently is.
 *
 * The options come from the server's transition table, so the form cannot
 * offer a move the server would refuse — and a return that is finished
 * shows no form at all rather than a disabled one.
 *
 * Declining requires a reason, enforced here and again in the action. The
 * customer is emailed whatever is typed, so this box is not an internal
 * note and the placeholder says so.
 */
export function ReturnRow({
  entry,
  transitions,
  reasonLabel,
  statusLabel,
}: {
  entry: QueuedReturn;
  transitions: ReturnStatus[];
  reasonLabel: string;
  statusLabel: string;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    decideReturnAction,
    null,
  );
  const [decision, setDecision] = useState<string>(transitions[0] ?? "");

  const requiresReason = decision === "rejected";

  return (
    <li className="border-b border-ek-green-200 py-6 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-15 text-ek-green-700">
          <span className="font-medium tabular-nums text-ek-green-900">
            {entry.orderRef}
          </span>{" "}
          · {reasonLabel} · {STAMP.format(entry.createdAt)} ·{" "}
          {formatPaise(entry.totalPaise)} ·{" "}
          {entry.paymentMethod === "cod" ? "Cash on delivery" : "Prepaid"}
        </p>
        <p className="text-15 text-ek-gold-800">{statusLabel}</p>
      </div>

      <p className="mt-2 max-w-[70ch] text-17 text-ek-green-900">
        {entry.detail}
      </p>

      <p className="mt-1 text-15 text-ek-green-700">
        {entry.customerName} ·{" "}
        <a
          href={`mailto:${entry.customerEmail}?subject=${encodeURIComponent(
            `Your return — order ${entry.orderRef}`,
          )}`}
          className="link-draw text-ek-green-900"
        >
          {entry.customerEmail}
        </a>
      </p>

      {entry.resolution && (
        <p className="mt-2 max-w-[70ch] border-l-2 border-ek-green-200 pl-4 text-15 text-ek-green-700">
          You said: {entry.resolution}
        </p>
      )}

      {transitions.length === 0 ? (
        <p className="mt-3 text-15 text-ek-green-700">
          Settled. Nothing further to do from here.
        </p>
      ) : (
        <form action={action} className="mt-4 max-w-2xl">
          <input type="hidden" name="id" value={entry.id} />

          <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_1fr]">
            <div>
              <label
                htmlFor={`decision-${entry.id}`}
                className="block text-15 text-ek-green-700"
              >
                Decision
              </label>
              <select
                id={`decision-${entry.id}`}
                name="status"
                value={decision}
                onChange={(event) => setDecision(event.target.value)}
                className="min-h-11 w-full border border-ek-green-200 bg-ek-paper px-2.5 py-1.5 text-15 text-ek-green-900 outline-none focus:border-ek-green-700"
              >
                {transitions.map((option) => (
                  <option key={option} value={option}>
                    {DECISION_LABEL[option] ?? option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`resolution-${entry.id}`}
                className="block text-15 text-ek-green-700"
              >
                What to tell them{requiresReason ? "" : " (optional)"}
              </label>
              <textarea
                id={`resolution-${entry.id}`}
                name="resolution"
                rows={2}
                maxLength={1000}
                required={requiresReason}
                placeholder={
                  requiresReason
                    ? "The reason. They are emailed this, so write it to them."
                    : "Anything they should know. Emailed to them."
                }
                className="min-h-20 w-full border border-ek-green-200 bg-ek-paper px-2.5 py-1.5 text-15 text-ek-green-900 outline-none focus:border-ek-green-700"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 cursor-pointer bg-ek-green-900 px-4 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save decision"}
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
      )}
    </li>
  );
}
