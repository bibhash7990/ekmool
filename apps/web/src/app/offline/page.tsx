import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

export const metadata: Metadata = {
  title: "You are offline",
  robots: { index: false, follow: false },
};

/**
 * What the service worker serves when a page is asked for, the network
 * does not answer, and nothing is cached.
 *
 * Prerendered and precached on install, so it is always available — a
 * fallback that needs the network to load is not a fallback.
 *
 * It says what still works rather than only what does not. A page that
 * reads "no internet connection" and stops is a page that has given up on
 * behalf of the reader; the cart is in their own browser and is fine, and
 * the pages they have already looked at will still open.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-[720px] px-5 py-20 lg:px-8 lg:py-28">
      <Eyebrow>No connection</Eyebrow>
      <h1 className="mt-5 font-display text-46 text-ek-green-900">
        You have gone offline
      </h1>

      <p className="mt-6 max-w-[60ch] text-20 text-ek-green-700">
        This page has not been loaded on this device before, so there is no
        copy of it here to show you. Nothing has been lost.
      </p>

      <SoilLine className="my-12" />

      <h2 className="eyebrow text-ek-green-700">What still works</h2>
      <ul className="mt-5 flex flex-col gap-4 text-17 text-ek-green-900">
        <li className="max-w-[62ch]">
          <strong className="font-medium">Your basket is safe.</strong> It is
          stored in this browser, not on our server, so it is exactly as you
          left it when the signal comes back.
        </li>
        <li className="max-w-[62ch]">
          <strong className="font-medium">
            Pages you have already visited will open.
          </strong>{" "}
          Product pages, the shop and the journal are kept on this device
          after the first visit.
        </li>
        <li className="max-w-[62ch]">
          <strong className="font-medium">
            An order placed offline is held, not lost.
          </strong>{" "}
          If you submit one while disconnected we keep it on this device and
          send it the moment you are back. It is not placed until then, and
          we will tell you either way.
        </li>
      </ul>

      <p className="mt-10 text-17 text-ek-green-700">
        <Link href="/" className="link-draw text-ek-green-900">
          Try the home page
        </Link>{" "}
        — it is usually the one already saved here.
      </p>
    </div>
  );
}
