import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { QueuedOrders } from "@/components/checkout/QueuedOrders";

export const metadata: Metadata = {
  title: "Your order is waiting to be sent",
  robots: { index: false, follow: false },
};

/**
 * Where someone lands after submitting an order with no connection.
 *
 * The heading says "waiting to be sent" and not "thank you for your
 * order", because it has not been placed and might still be refused — for
 * stock, for a coupon that expired while the phone was in a tunnel. Saying
 * otherwise would be the easy, warm, wrong thing.
 *
 * Everything on it is read from IndexedDB in the browser. There is nothing
 * on the server to look up: that is the point.
 */
export default function QueuedOrderPage() {
  return (
    <div className="mx-auto max-w-[720px] px-5 py-16 lg:px-8 lg:py-24">
      <Eyebrow>Held on this device</Eyebrow>
      <h1 className="mt-5 font-display text-46 text-ek-green-900">
        Waiting to be sent
      </h1>

      <p className="mt-6 max-w-[60ch] text-20 text-ek-green-700">
        You submitted this while offline, so it is stored here in your
        browser rather than with us. It goes as soon as you have a
        connection — you can close this page.
      </p>

      <QueuedOrders standalone />

      <p className="mt-12 max-w-[62ch] text-15 text-ek-green-700">
        This only works on this device and in this browser. If it matters
        and you are not sure it went, the safest thing is to check back here
        once you have signal — or write to us and we will look.
      </p>
    </div>
  );
}
