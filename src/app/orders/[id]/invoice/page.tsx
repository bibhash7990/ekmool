import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getOrderById, allocateInvoiceNumber } from "@/db/queries/orders";
import { getSellerIdentity } from "@/lib/env";
import { formatPaise } from "@/lib/money";
import {
  supplyKind,
  taxFromInclusive,
  shippingRateBps,
  formatRateBps,
} from "@/lib/gst";
import { PrintButton } from "@/components/account/PrintButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * A printable invoice. HTML and @media print, not a PDF: a PDF library is
 * a large dependency for something every browser can already do, and
 * "Save as PDF" in the print dialog produces the same file.
 *
 * Readable by anyone holding the order's ULID, exactly like the order page
 * — it is the buyer's own document and the link is the credential.
 *
 * Whether this is a **tax invoice** or a **pro-forma** depends entirely on
 * whether a real seller identity is configured. It is never both, and it
 * never guesses: a fabricated GSTIN on a document a customer might hand to
 * their own accountant is not a thing this will print.
 */
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) notFound();

  const order = await getOrderById(id);
  if (!order) notFound();

  const seller = getSellerIdentity();

  // Allocated on first render, never at checkout — see allocateInvoiceNumber.
  const allocated = await allocateInvoiceNumber(id);
  const invoiceNumber = allocated?.invoiceNumber ?? null;
  const invoiceDate = allocated?.invoiceDate ?? order.createdAt;

  const kind = supplyKind(order.sellerState, order.placeOfSupply);

  // Delivery is part of the supply, not a separate service, so it carries
  // the rate of the principal supply. Derived rather than stored: every
  // input to it is frozen on the order already.
  const shippingTax = taxFromInclusive(
    order.shippingPaise,
    shippingRateBps(order.items.map((item) => item.gstRateBps)),
    kind,
  );

  const taxableTotal =
    order.items.reduce((sum, item) => sum + item.taxableValuePaise, 0) +
    shippingTax.taxablePaise;
  const cgstTotal =
    order.items.reduce((sum, item) => sum + item.cgstPaise, 0) +
    shippingTax.cgstPaise;
  const sgstTotal =
    order.items.reduce((sum, item) => sum + item.sgstPaise, 0) +
    shippingTax.sgstPaise;
  const igstTotal =
    order.items.reduce((sum, item) => sum + item.igstPaise, 0) +
    shippingTax.igstPaise;
  const taxTotal = cgstTotal + sgstTotal + igstTotal;

  /**
   * A tax invoice must do two things: identify a registered seller and show
   * the tax. That is **one** condition, not two, and the whole document
   * hangs off it — heading, columns, totals and footer alike.
   *
   * Splitting it was a real defect. An unregistered shop collects no GST
   * (CGST Act s.32), so a document headed "no GST registration is
   * configured" must not also print a CGST and SGST breakdown; that reads as
   * tax charged but uncreditable, which is not what happened. Either the
   * document accounts for GST throughout or it accounts for none of it.
   *
   * taxTotal can still be zero with a seller present: an order placed before
   * the registration was configured has no tax recorded against it — see
   * 003_gst_invoicing.sql — and printing today's registration on it would be
   * backdating a claim.
   */
  const isTaxInvoice = seller !== null && taxTotal > 0;

  // What the goods were sold for, when no tax is being accounted for. The
  // stored taxable value is only meaningful alongside a tax figure.
  const supplyValue = isTaxInvoice
    ? taxableTotal
    : order.items.reduce((sum, item) => sum + item.lineTotalPaise, 0) +
      order.shippingPaise;

  return (
    <div className="mx-auto max-w-[820px] px-5 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          href={`/orders/${order.id}`}
          className="link-draw text-15 text-ek-green-700"
        >
          ← Back to your order
        </Link>
        <PrintButton />
      </div>

      {!isTaxInvoice && (
        <p className="mt-6 border border-ek-terracotta bg-ek-terracotta/5 px-4 py-3 text-15 text-ek-terracotta print:mt-0">
          <strong>Pro-forma — this is not a tax invoice.</strong>{" "}
          {seller === null
            ? "This shop has no GST registration configured, so no GST has been charged and none can be claimed. The document is a complete record of what was paid."
            : "This order was placed before the shop recorded its registration, so no GST was charged on it and none can be claimed. The document is a complete record of what was paid."}
        </p>
      )}

      <article className="mt-8 border border-ek-green-200 p-8 print:mt-4 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-ek-green-200 pb-6">
          <div>
            <p className="eyebrow text-ek-green-700">
              {isTaxInvoice ? "Tax invoice" : "Pro-forma invoice"}
            </p>
            <h1 className="mt-3 font-display text-34 text-ek-green-900">
              {seller?.legalName ?? "Ekmool"}
            </h1>
            {seller ? (
              <address className="mt-3 max-w-[38ch] text-15 leading-relaxed text-ek-green-700 not-italic">
                {seller.address}
                <br />
                GSTIN: <strong className="text-ek-green-900">{seller.gstin}</strong>
                {seller.fssai && (
                  <>
                    <br />
                    FSSAI: {seller.fssai}
                  </>
                )}
              </address>
            ) : (
              <p className="mt-3 max-w-[38ch] text-15 text-ek-green-700">
                Seller details are not configured.
              </p>
            )}
          </div>

          <dl className="text-15 text-ek-green-700">
            <div className="flex gap-3">
              <dt>Invoice no.</dt>
              <dd className="tabular-nums text-ek-green-900">
                {invoiceNumber ?? "—"}
              </dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt>Invoice date</dt>
              <dd className="tabular-nums text-ek-green-900">
                {DATE.format(invoiceDate)}
              </dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt>Order</dt>
              <dd className="tabular-nums text-ek-green-900">
                #{order.id.slice(-8).toUpperCase()}
              </dd>
            </div>
            <div className="mt-1 flex gap-3">
              <dt>Order date</dt>
              <dd className="tabular-nums text-ek-green-900">
                {DATE.format(order.createdAt)}
              </dd>
            </div>
          </dl>
        </header>

        <div className="grid gap-8 border-b border-ek-green-200 py-6 sm:grid-cols-2">
          <section>
            <h2 className="eyebrow text-ek-green-700">Billed and shipped to</h2>
            <address className="mt-3 text-15 leading-relaxed text-ek-green-900 not-italic">
              {order.customerName}
              <br />
              {order.address.line1}
              {order.address.line2 && (
                <>
                  <br />
                  {order.address.line2}
                </>
              )}
              <br />
              {order.address.city}, {order.address.state}{" "}
              {order.address.pincode}
              <br />
              {order.customerPhone}
            </address>
          </section>
          <section>
            <h2 className="eyebrow text-ek-green-700">Supply</h2>
            <dl className="mt-3 text-15 text-ek-green-700">
              <div className="flex gap-3">
                <dt>Place of supply</dt>
                <dd className="text-ek-green-900">
                  {order.placeOfSupply ?? order.address.state}
                </dd>
              </div>
              <div className="mt-1 flex gap-3">
                <dt>Payment</dt>
                <dd className="text-ek-green-900">
                  {order.paymentMethod === "cod"
                    ? "Cash on Delivery"
                    : "Paid online"}
                </dd>
              </div>
              {/* A GST-invoice field. Meaningless on a pro-forma, where no
                  tax is charged for anyone to be liable for. */}
              {isTaxInvoice && (
                <div className="mt-1 flex gap-3">
                  <dt>Reverse charge</dt>
                  <dd className="text-ek-green-900">No</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <div className="overflow-x-auto py-6">
          <table className="w-full min-w-[560px] text-left text-15">
            <thead>
              <tr className="border-b border-ek-green-200 text-ek-green-700">
                <th scope="col" className="pb-2 font-normal">
                  Description
                </th>
                <th scope="col" className="pb-2 font-normal">
                  HSN
                </th>
                <th scope="col" className="pb-2 text-right font-normal">
                  Qty
                </th>
                {/* Both columns exist only on a tax invoice. A pro-forma that
                    ruled a GST column and filled it with dashes would still
                    be inviting the reader to look for tax that was never
                    charged. */}
                {isTaxInvoice && (
                  <>
                    <th scope="col" className="pb-2 text-right font-normal">
                      Taxable
                    </th>
                    <th scope="col" className="pb-2 text-right font-normal">
                      GST
                    </th>
                  </>
                )}
                <th scope="col" className="pb-2 text-right font-normal">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.sku} className="border-b border-ek-green-200">
                  <td className="py-2.5 text-ek-green-900">
                    {item.productName}
                    <span className="block text-ek-green-700">
                      {item.packSizeLabel} · {item.sku}
                    </span>
                  </td>
                  <td className="py-2.5 tabular-nums text-ek-green-700">
                    {item.hsnCode ?? "—"}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-ek-green-900">
                    {item.qty}
                  </td>
                  {isTaxInvoice && (
                    <>
                      <td className="py-2.5 text-right tabular-nums text-ek-green-900">
                        {formatPaise(item.taxableValuePaise)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ek-green-700">
                        {item.gstRateBps > 0 ? (
                          <>
                            {formatRateBps(item.gstRateBps)}
                            <span className="block">
                              {formatPaise(
                                item.lineTotalPaise - item.taxableValuePaise,
                              )}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </>
                  )}
                  <td className="py-2.5 text-right tabular-nums text-ek-green-900">
                    {formatPaise(item.lineTotalPaise)}
                  </td>
                </tr>
              ))}

              {order.shippingPaise > 0 && (
                <tr className="border-b border-ek-green-200">
                  <td className="py-2.5 text-ek-green-900">
                    Delivery
                    {isTaxInvoice && (
                      <span className="block text-ek-green-700">
                        Charged at the rate of the goods it carries
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-ek-green-700">—</td>
                  <td className="py-2.5 text-right tabular-nums text-ek-green-900">
                    1
                  </td>
                  {isTaxInvoice && (
                    <>
                      <td className="py-2.5 text-right tabular-nums text-ek-green-900">
                        {formatPaise(shippingTax.taxablePaise)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-ek-green-700">
                        {shippingTax.taxPaise > 0 ? (
                          <>
                            {formatRateBps(shippingTax.rateBps)}
                            <span className="block">
                              {formatPaise(shippingTax.taxPaise)}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </>
                  )}
                  <td className="py-2.5 text-right tabular-nums text-ek-green-900">
                    {formatPaise(order.shippingPaise)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto max-w-xs space-y-2 text-15">
          <div className="flex justify-between gap-6">
            <dt className="text-ek-green-700">
              {isTaxInvoice ? "Taxable value" : "Value of supply"}
            </dt>
            <dd className="tabular-nums text-ek-green-900">
              {formatPaise(supplyValue)}
            </dd>
          </div>

          {isTaxInvoice && cgstTotal > 0 && (
            <div className="flex justify-between gap-6">
              <dt className="text-ek-green-700">CGST</dt>
              <dd className="tabular-nums text-ek-green-900">
                {formatPaise(cgstTotal)}
              </dd>
            </div>
          )}
          {isTaxInvoice && sgstTotal > 0 && (
            <div className="flex justify-between gap-6">
              <dt className="text-ek-green-700">SGST</dt>
              <dd className="tabular-nums text-ek-green-900">
                {formatPaise(sgstTotal)}
              </dd>
            </div>
          )}
          {isTaxInvoice && igstTotal > 0 && (
            <div className="flex justify-between gap-6">
              <dt className="text-ek-green-700">IGST</dt>
              <dd className="tabular-nums text-ek-green-900">
                {formatPaise(igstTotal)}
              </dd>
            </div>
          )}

          <div className="flex justify-between gap-6 border-t border-ek-green-200 pt-2 text-17 font-semibold text-ek-green-900">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPaise(order.totalPaise)}</dd>
          </div>
        </dl>

        <footer className="mt-8 border-t border-ek-green-200 pt-5 text-15 text-ek-green-700">
          <p>
            {isTaxInvoice
              ? "All prices are inclusive of GST at the rates shown. This is a computer-generated document and needs no signature."
              : "No GST has been charged on this order. This is a computer-generated document and needs no signature."}
          </p>
          {order.status === "cancelled" && (
            <p className="mt-2 text-ek-terracotta">
              This order was cancelled. Nothing was supplied against this
              document.
            </p>
          )}
        </footer>
      </article>
    </div>
  );
}
