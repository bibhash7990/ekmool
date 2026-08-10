import type { Metadata } from "next";
import Link from "next/link";
import { confirmSubscription } from "@/db/queries/newsletter";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  robots: { index: false, follow: false },
};

/**
 * The second half of double opt-in.
 *
 * Confirming on GET is a deliberate choice and it is the right one here:
 * every mail client in existence follows a link with GET, and asking
 * someone to click a link and then press a button converts a one-step
 * action into two for no gain. The token is single-purpose, unguessable,
 * and grants nothing but membership of a mailing list — the usual argument
 * against side effects on GET is about prefetchers and crawlers, and a
 * prefetcher that confirms a subscription the recipient asked for has done
 * no harm.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = (raw ?? "").trim();

  let outcome: "confirmed" | "already_confirmed" | "unknown" | "error" =
    "unknown";

  if (/^[0-9a-f]{64}$/.test(token)) {
    try {
      outcome = await confirmSubscription(token);
    } catch (error) {
      console.error("[newsletter] confirm failed:", error);
      outcome = "error";
    }
  }

  const copy = {
    confirmed: {
      heading: "You are on the list.",
      body: "We will write when a harvest lands or a batch is milled, and not otherwise. Every issue carries an unsubscribe link that works in one click.",
    },
    already_confirmed: {
      heading: "You were already on the list.",
      body: "Nothing has changed, and we have not added you twice.",
    },
    unknown: {
      heading: "That link has expired.",
      body: "Confirmation links are replaced whenever a new one is requested, so an older email will not work. Sign up again from the foot of any page and we will send a fresh one.",
    },
    error: {
      heading: "We could not confirm that just now.",
      body: "Something went wrong at our end and nothing has changed. Try the link again in a few minutes.",
    },
  }[outcome];

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24">
      <Eyebrow>The letter</Eyebrow>
      <h1 className="mt-5 max-w-2xl font-display text-46 text-ek-green-900">
        {copy.heading}
      </h1>
      <SoilLine align="left" className="my-10 max-w-sm" />
      <p className="max-w-[60ch] text-20 text-ek-green-700">{copy.body}</p>
      <Link
        href="/products"
        className="link-draw mt-8 inline-block text-17 text-ek-gold-800"
      >
        Back to the shop
      </Link>
    </div>
  );
}
