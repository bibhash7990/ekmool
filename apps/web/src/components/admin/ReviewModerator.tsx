"use client";

import { useActionState } from "react";
import { moderateReviewAction, type ActionResult } from "@/app/admin/actions";
import type { PendingReview } from "@/db/queries/reviews";

/**
 * One review, and the two decisions available.
 *
 * Reject is not delete. The row stays, with the note, so a customer asking
 * why their review never appeared can be answered — and so a pattern of
 * rejections is visible rather than invisible.
 */
export function ReviewModerator({ review }: { review: PendingReview }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    moderateReviewAction,
    null,
  );

  return (
    <li className="border-b border-ek-green-200 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-17 text-ek-green-900">
          <span className="tabular-nums">{review.rating}/5</span> ·{" "}
          {review.title}
        </p>
        <p className="text-15 text-ek-green-700">
          {review.productSlug} · {review.displayName} ·{" "}
          {review.createdAt.toLocaleDateString("en-IN")}
        </p>
      </div>

      <p className="mt-3 max-w-[76ch] text-15 text-ek-green-700">
        {review.body}
      </p>

      <p className="mt-2 text-15 text-ek-green-700">
        Verified against order{" "}
        <span className="tabular-nums">{review.orderId.slice(-8)}</span> ·{" "}
        {review.customerEmail}
      </p>

      <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={review.id} />
        <label htmlFor={`note-${review.id}`} className="sr-only">
          Note for review {review.id}
        </label>
        <input
          id={`note-${review.id}`}
          name="note"
          type="text"
          maxLength={500}
          placeholder="Note (optional, not shown to the customer)"
          className="min-h-10 min-w-0 flex-1 border border-ek-green-200 bg-ek-paper px-2 py-1.5 text-15"
        />
        <button
          type="submit"
          name="status"
          value="published"
          disabled={pending}
          className="min-h-10 cursor-pointer bg-ek-green-900 px-3.5 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
        >
          Publish
        </button>
        <button
          type="submit"
          name="status"
          value="rejected"
          disabled={pending}
          className="min-h-10 cursor-pointer border border-ek-green-200 px-3.5 py-1.5 text-15 text-ek-green-900 transition-colors hover:border-ek-terracotta hover:text-ek-terracotta disabled:opacity-50"
        >
          Reject
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
    </li>
  );
}
