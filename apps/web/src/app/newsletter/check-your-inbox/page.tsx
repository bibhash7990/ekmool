import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

export const metadata: Metadata = {
  title: "Check your inbox",
  robots: { index: false, follow: false },
};

/**
 * Where the footer form lands.
 *
 * It says the same thing to everyone — a new address, one already
 * subscribed, one that has unsubscribed before — because a page that
 * distinguished them would let anyone learn who is on this list by typing
 * addresses into a form.
 *
 * The two flags it does read are about the request, not the address:
 * whether the address was well-formed, and whether we were able to write it
 * down at all.
 */
export default async function CheckYourInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ invalid?: string; unavailable?: string }>;
}) {
  const params = await searchParams;

  if (params.invalid) {
    return (
      <Shell heading="That address did not look right.">
        <p className="max-w-[60ch] text-20 text-ek-green-700">
          Nothing has been signed up. Try again from the foot of any page —
          it wants a full address, like you@example.com.
        </p>
      </Shell>
    );
  }

  if (params.unavailable) {
    return (
      <Shell heading="We could not take that just now.">
        <p className="max-w-[60ch] text-20 text-ek-green-700">
          Something went wrong at our end, so nothing was signed up. Please
          try again in a few minutes.
        </p>
      </Shell>
    );
  }

  return (
    <Shell heading="Check your inbox.">
      <p className="max-w-[60ch] text-20 text-ek-green-700">
        If that address is not already on the list, an email is on its way
        with a link to confirm. Nothing is sent until you click it.
      </p>
      <p className="mt-5 max-w-[60ch] text-17 text-ek-green-700">
        Nothing arrived? It may be in spam, or the address may already be
        subscribed — in which case there is nothing to do.
      </p>
    </Shell>
  );
}

function Shell({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24">
      <Eyebrow>The letter</Eyebrow>
      <h1 className="mt-5 max-w-2xl font-display text-46 text-ek-green-900">
        {heading}
      </h1>
      <SoilLine align="left" className="my-10 max-w-sm" />
      {children}
      <Link
        href="/products"
        className="link-draw mt-8 inline-block text-17 text-ek-gold-800"
      >
        Back to the shop
      </Link>
    </div>
  );
}
