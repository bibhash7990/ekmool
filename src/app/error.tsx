"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-[720px] px-5 py-24 lg:py-36">
      <Eyebrow>Something went wrong</Eyebrow>
      <h1 className="mt-6 font-display text-46 text-ek-green-900">
        We hit a knot in the root.
      </h1>
      <p className="mt-6 text-17 text-ek-green-700">
        This page failed to load. Your cart is untouched — try again, and if it
        keeps happening, write to us and we&apos;ll sort it out.
      </p>
      {error.digest && (
        <p className="mt-3 text-15 text-ek-green-700/70">
          Reference: {error.digest}
        </p>
      )}
      <SoilLine align="left" className="my-10 max-w-xs" />
      <div className="flex flex-wrap items-center gap-6">
        <Button onClick={reset}>Try again</Button>
        <Link href="/contact" className="link-draw text-17 text-ek-green-900">
          Contact us
        </Link>
      </div>
    </section>
  );
}
