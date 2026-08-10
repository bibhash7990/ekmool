import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribe } from "@/db/queries/newsletter";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribed",
  robots: { index: false, follow: false },
};

/**
 * One click, no login, no "are you sure", no survey asking why.
 *
 * Article 7(3) of the GDPR requires withdrawing consent to be as easy as
 * giving it, and giving it was one click. Anything that makes leaving
 * harder than arriving fails that test and, separately, is the behaviour
 * of a shop that does not deserve the subscription.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = (raw ?? "").trim();

  let failed = false;

  if (/^[0-9a-f]{64}$/.test(token)) {
    try {
      // The boolean is deliberately discarded. `false` means the row was
      // already unsubscribed, which from the reader's side is the same
      // outcome as having just done it — and an unknown token gets the
      // same page too, because confirming that a token is not ours would
      // let someone probe the list.
      await unsubscribe(token);
    } catch (error) {
      console.error("[newsletter] unsubscribe failed:", error);
      failed = true;
    }
  }

  const heading = failed
    ? "We could not do that just now."
    : "You are unsubscribed.";

  const body = failed
    ? "Something went wrong at our end and nothing has changed. Try the link again in a few minutes, or write to us and we will do it by hand."
    : "We will not write again. Your orders and your account are untouched — this only ends the letter.";

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24">
      <Eyebrow>The letter</Eyebrow>
      <h1 className="mt-5 max-w-2xl font-display text-46 text-ek-green-900">
        {heading}
      </h1>
      <SoilLine align="left" className="my-10 max-w-sm" />
      <p className="max-w-[60ch] text-20 text-ek-green-700">{body}</p>
      <div className="mt-8 flex flex-wrap gap-6">
        <Link href="/products" className="link-draw text-17 text-ek-gold-800">
          Back to the shop
        </Link>
        <Link href="/contact" className="link-draw text-17 text-ek-green-700">
          Tell us why
        </Link>
      </div>
    </div>
  );
}
