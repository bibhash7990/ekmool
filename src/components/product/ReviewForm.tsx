"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

/**
 * The trigger, and only the trigger.
 *
 * The composer behind it — star picker, two fields, eligibility check,
 * submit handling — is loaded when someone actually asks to write a
 * review, which on a product page is almost nobody. That is the case
 * `next/dynamic` is for: the chunk is never requested while `open` is
 * false, so the overwhelming majority of product page views pay nothing
 * for it.
 */
const ReviewComposer = dynamic(() =>
  import("./ReviewComposer").then((module) => module.ReviewComposer),
);

export function ReviewForm({
  productSlug,
  productName,
}: {
  productSlug: string;
  productName: string;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <ReviewComposer
        productSlug={productSlug}
        productName={productName}
        onClose={() => setOpen(false)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="min-h-11 cursor-pointer border border-ek-green-900 px-5 text-17 text-ek-green-900 transition-colors hover:bg-ek-green-900 hover:text-ek-cream"
    >
      Write a review
    </button>
  );
}
