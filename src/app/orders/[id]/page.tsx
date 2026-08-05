import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getOrderById, getOrderTimeline } from "@/db/queries/orders";
import {
  getReturnForOrder,
  isReturnWindowOpen,
  RETURN_REASONS,
} from "@/db/queries/returns";
import { getSession } from "@/lib/session";
import { formatPaise } from "@/lib/money";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { ButtonLink } from "@/components/ui/Button";
import { OrderTimeline } from "@/components/account/OrderTimeline";
import { CancelOrderButton } from "@/components/account/CancelOrderButton";
import { ReturnRequestForm } from "@/components/account/ReturnRequestForm";
import { ReorderButton } from "@/components/account/ReorderButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** A customer may still call it off at these stages; after packing, they cannot. */
const CANCELLABLE = new Set(["pending", "confirmed"]);

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

const RETURN_STATUS_LABEL: Record<string, string> = {
  requested: "We have your request and will reply shortly.",
  approved: "Approved — we will be in touch with what happens next.",
  rejected: "We could not accept this one.",
  received: "Your return has reached us.",
  refunded: "Refunded.",
};

/**
 * The order page proper — status, history, items, address, and what the
 * customer can still do about it.
 *
 * Reading it needs only the ULID, which is the credential in the emailed
 * link and is not guessable. Cancelling needs a session whose verified
 * email matches, because that one is destructive.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) notFound();

  const [order, session] = await Promise.all([getOrderById(id), getSession()]);
  if (!order) notFound();

  const [history, existingReturn] = await Promise.all([
    getOrderTimeline(id),
    getReturnForOrder(id),
  ]);

  const shortId = order.id.slice(-8).toUpperCase();
  const isOwner = session?.email === order.customerEmail.toLowerCase();
  const isCod = order.paymentMethod === "cod";
  const prepaid = order.paymentStatus === "paid";
  const canCancel = CANCELLABLE.has(order.status) && !prepaid;

  // Delivered, inside the longest window, nothing open yet. The per-reason
  // windows are enforced in createReturnRequest; this only decides whether
  // to offer the form, so a month-old order is not asked about.
  const canRequestReturn =
    order.status === "delivered" &&
    !existingReturn &&
    isReturnWindowOpen(order.deliveredAt);

  // An invoice exists for anything actually supplied. A pending order has
  // been paid for by nobody yet, and a cancelled one supplied nothing.
  const hasInvoice = order.status !== "pending" && order.status !== "cancelled";

  return (
    <div className="mx-auto max-w-[900px] px-5 py-12 lg:py-16">
      {/* No Breadcrumbs component here on purpose: it emits BreadcrumbList
          structured data, and this page is noindex and private. */}
      <Link href="/track" className="link-draw text-15 text-ek-green-700">
        ← Your orders
      </Link>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <Eyebrow>Order #{shortId}</Eyebrow>
          <h1 className="mt-4 font-display text-46 text-ek-green-900">
            {order.status === "cancelled"
              ? "This order was cancelled."
              : order.status === "delivered"
                ? "Delivered."
                : "On its way to you."}
          </h1>
        </div>
        <p className="text-15 text-ek-green-700">
          Placed {DATE_FORMAT.format(order.createdAt)}
        </p>
      </div>

      <SoilLine className="my-10" />

      <section aria-labelledby="progress-heading">
        <h2 id="progress-heading" className="eyebrow text-ek-green-700">
          Progress
        </h2>
        <div className="mt-6">
          <OrderTimeline status={order.status} history={history} />
        </div>

        {order.trackingId && (
          <p className="mt-8 border border-ek-green-200 bg-ek-gold-100/40 px-5 py-4 text-17 text-ek-green-900">
            Tracking number{" "}
            <strong className="tracking-[0.06em]">{order.trackingId}</strong>
            <span className="mt-1 block text-15 text-ek-green-700">
              The first courier scan can take a few hours to appear — that is
              normal.
            </span>
          </p>
        )}
      </section>

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
            {order.address.city}, {order.address.state} {order.address.pincode}
            <br />
            {order.customerPhone}
          </address>
        </section>

        <section aria-labelledby="payment-heading">
          <h2 id="payment-heading" className="eyebrow text-ek-green-700">
            Payment
          </h2>
          <p className="mt-5 text-17 text-ek-green-900">
            {isCod ? "Cash on Delivery" : "Paid online"} ·{" "}
            {PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}
          </p>
          {isCod && order.status !== "cancelled" && (
            <p className="mt-2 text-15 text-ek-green-700">
              Please keep {formatPaise(order.totalPaise)} ready for the courier.
            </p>
          )}
        </section>
      </div>

      <SoilLine className="my-12" />

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="sr-only">
          What you can do
        </h2>

        {order.status === "cancelled" ? (
          <p className="max-w-[54ch] text-17 text-ek-green-700">
            Nothing was dispatched and the stock went back on sale. If this was
            not you, or you would like it back,{" "}
            <Link href="/contact" className="link-draw text-ek-green-900">
              tell us
            </Link>{" "}
            and we will sort it out.
          </p>
        ) : canCancel && isOwner ? (
          <CancelOrderButton orderId={order.id} />
        ) : canCancel ? (
          <p className="max-w-[54ch] text-17 text-ek-green-700">
            Need to cancel?{" "}
            <Link
              href={`/track?ref=${shortId}`}
              className="link-draw text-ek-green-900"
            >
              Confirm it is your order
            </Link>{" "}
            — the reference above plus your email — and the option appears here.
          </p>
        ) : prepaid && CANCELLABLE.has(order.status) ? (
          <p className="max-w-[54ch] text-17 text-ek-green-700">
            This order has been paid, so cancelling it means issuing a refund.{" "}
            <Link href="/contact" className="link-draw text-ek-green-900">
              Contact us
            </Link>{" "}
            and we will cancel and refund it for you.
          </p>
        ) : order.status === "delivered" ? null : (
          <p className="max-w-[54ch] text-17 text-ek-green-700">
            This order has already been packed, so it can no longer be
            cancelled here.{" "}
            <Link href="/contact" className="link-draw text-ek-green-900">
              Get in touch
            </Link>{" "}
            if something needs changing.
          </p>
        )}

        {existingReturn && (
          <div className="max-w-[54ch] border border-ek-green-200 bg-ek-gold-100/40 px-5 py-4">
            <p className="text-17 text-ek-green-900">
              Return requested{" "}
              {RETURN_REASONS.find((r) => r.value === existingReturn.reason)
                ?.label.toLowerCase() ?? existingReturn.reason}
            </p>
            <p className="mt-1.5 text-15 text-ek-green-700">
              {RETURN_STATUS_LABEL[existingReturn.status] ??
                existingReturn.status}
            </p>
            {existingReturn.resolution && (
              <p className="mt-2 text-15 text-ek-green-900">
                {existingReturn.resolution}
              </p>
            )}
          </div>
        )}

        {canRequestReturn &&
          (isOwner ? (
            <div className="mt-2">
              <ReturnRequestForm
                orderId={order.id}
                reasons={RETURN_REASONS.map((reason) => ({
                  value: reason.value,
                  label: reason.label,
                  windowHours: reason.windowHours,
                  help: reason.help,
                }))}
              />
            </div>
          ) : (
            <p className="max-w-[54ch] text-17 text-ek-green-700">
              Something wrong with this order?{" "}
              <Link
                href={`/track?ref=${shortId}`}
                className="link-draw text-ek-green-900"
              >
                Confirm it is yours
              </Link>{" "}
              and you can tell us here.
            </p>
          ))}

        <div className="mt-10 flex flex-wrap items-center gap-6">
          <ReorderButton orderId={order.id} />
          {hasInvoice && (
            <Link
              href={`/orders/${order.id}/invoice`}
              className="link-draw text-17 text-ek-green-900"
            >
              View invoice
            </Link>
          )}
          <ButtonLink href="/products" variant="ghost">
            Continue shopping
          </ButtonLink>
          {!session && (
            <Link href="/track" className="link-draw text-17 text-ek-green-900">
              See all your orders
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
