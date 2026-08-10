import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getOrderById } from "@/db/queries/orders";
import { formatPaise } from "@/lib/money";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { ButtonLink } from "@/components/ui/Button";
import { TaprootMark } from "@/components/home/TaprootMark";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order confirmed",
  description:
    "Your Ekmool order is confirmed. Here are the details, what happens next, and how to reach us if anything needs changing before dispatch.",
  robots: { index: false, follow: false },
};

export default async function OrderConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let order = null;
  let lookupFailed = false;
  try {
    order = await getOrderById(id);
  } catch (error) {
    console.error("[order-confirmed] lookup failed:", error);
    lookupFailed = true;
  }

  // The database being down must not imply the order failed — it was
  // committed before this page was reached.
  if (lookupFailed) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-20 lg:py-28">
        <Eyebrow>Order received</Eyebrow>
        <h1 className="mt-5 font-display text-46 text-ek-green-900">
          Your order is placed.
        </h1>
        <p className="mt-6 text-17 text-ek-green-700">
          We could not load the full details just now, but your order went
          through and your confirmation email is on its way. Your reference is
          below — quote it if you need to contact us.
        </p>
        <p className="mt-4 font-display text-26 text-ek-green-900">
          #{id.slice(-8).toUpperCase()}
        </p>
        <SoilLine align="left" className="my-10 max-w-xs" />
        <ButtonLink href="/products">Continue shopping</ButtonLink>
      </div>
    );
  }

  if (!order) notFound();

  const shortId = order.id.slice(-8).toUpperCase();
  const isCod = order.paymentMethod === "cod";

  return (
    <div className="mx-auto max-w-[820px] px-5 py-16 lg:py-24">
      <div className="flex items-start gap-6">
        <TaprootMark className="hidden h-24 w-auto shrink-0 sm:block" />
        <div>
          <Eyebrow>Order #{shortId}</Eyebrow>
          <h1 className="mt-5 font-display text-46 text-ek-green-900">
            Thank you, {order.customerName.split(" ")[0]}.
          </h1>
          <p className="mt-5 max-w-[52ch] text-20 text-ek-green-700">
            {isCod
              ? `Your order is confirmed. Keep ${formatPaise(order.totalPaise)} ready for the courier — we pack within one working day.`
              : order.paymentStatus === "paid"
                ? "Payment received and your order is confirmed. We pack within one working day."
                : "Your order is saved. We will confirm it the moment your payment is verified — this usually takes a minute or two."}
          </p>
        </div>
      </div>

      <SoilLine className="my-12" />

      <section aria-labelledby="items-heading">
        <h2 id="items-heading" className="eyebrow text-ek-green-700">
          What you ordered
        </h2>
        <ul className="mt-6 border-t border-ek-green-200">
          {order.items.map((item) => (
            <li
              key={item.sku}
              className="flex justify-between gap-6 border-b border-ek-green-200 py-4"
            >
              <div>
                <Link
                  href={`/products/${item.productSlug}`}
                  className="link-draw text-17 text-ek-green-900"
                >
                  {item.productName}
                </Link>
                <p className="mt-1 text-15 text-ek-green-700">
                  {item.packSizeLabel} × {item.qty}
                </p>
              </div>
              <p className="text-17 tabular-nums text-ek-green-900">
                {formatPaise(item.lineTotalPaise)}
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-6 ml-auto max-w-xs space-y-2.5 text-17">
          <div className="flex justify-between gap-4">
            <dt className="text-ek-green-700">Subtotal</dt>
            <dd className="tabular-nums">{formatPaise(order.subtotalPaise)}</dd>
          </div>
          {order.discountPaise > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-ek-green-700">
                Discount
                {order.couponCode && (
                  <span className="tracking-[0.06em]"> · {order.couponCode}</span>
                )}
              </dt>
              <dd className="tabular-nums">
                −{formatPaise(order.discountPaise)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-ek-green-700">Shipping</dt>
            <dd className="tabular-nums">
              {order.shippingPaise === 0
                ? "Free"
                : formatPaise(order.shippingPaise)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-ek-green-200 pt-2.5 text-20 font-semibold text-ek-green-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPaise(order.totalPaise)}</dd>
          </div>
        </dl>
      </section>

      <SoilLine className="my-12" />

      <div className="grid gap-10 sm:grid-cols-2">
        <section aria-labelledby="delivery-heading">
          <h2 id="delivery-heading" className="eyebrow text-ek-green-700">
            Delivering to
          </h2>
          <address className="mt-5 text-17 leading-relaxed text-ek-green-900 not-italic">
            {order.customerName}
            <br />
            {order.address.line1}
            <br />
            {order.address.line2 && (
              <>
                {order.address.line2}
                <br />
              </>
            )}
            {order.address.city}, {order.address.state}{" "}
            {order.address.pincode}
            <br />
            {order.customerPhone}
          </address>
        </section>

        <section aria-labelledby="next-heading">
          <h2 id="next-heading" className="eyebrow text-ek-green-700">
            What happens next
          </h2>
          <ol className="mt-5 space-y-3 text-17 text-ek-green-700">
            <li>1 · A confirmation email is on its way to you.</li>
            <li>2 · We mill and pack your order within one working day.</li>
            <li>3 · You get a tracking link the moment it ships.</li>
          </ol>
        </section>
      </div>

      <SoilLine className="my-12" />

      <section aria-labelledby="keep-heading">
        <h2 id="keep-heading" className="eyebrow text-ek-green-700">
          Keep this reference
        </h2>
        <p className="mt-5 max-w-[54ch] text-17 text-ek-green-700">
          <strong className="text-ek-green-900">#{shortId}</strong> plus the
          email you used is all you ever need to reach this order — no account,
          no password. Bookmark this page or{" "}
          <Link
            href={`/orders/${order.id}`}
            className="link-draw text-ek-green-900"
          >
            open your order
          </Link>{" "}
          to follow it, change your mind, or see everything you have bought
          from us.
        </p>
      </section>

      <div className="mt-12 flex flex-wrap items-center gap-6">
        <ButtonLink href="/products">Continue shopping</ButtonLink>
        <Link
          href={`/orders/${order.id}`}
          className="link-draw text-17 text-ek-green-900"
        >
          Track this order
        </Link>
        <Link href="/contact" className="link-draw text-17 text-ek-green-900">
          Need to change something?
        </Link>
      </div>
    </div>
  );
}
