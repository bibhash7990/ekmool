import type { Order } from "@/db/queries/orders";
import { formatPaise } from "@/lib/money";
import type { MailMessage } from "@/lib/mail/provider";
import { renderEmailShell, emailButton, escapeHtml } from "./layout";

/**
 * The second and last email about an unpaid order.
 *
 * It exists because there is a real deadline the customer does not know
 * about: the stock behind their order is held until the 48-hour sweep
 * cancels it, and after that the packs go back on the shelf for anyone
 * else. Telling them that is information, not pressure — which is why
 * there is no discount, no countdown graphic and no "hurry".
 *
 * "Only X left" appears nowhere. The stock figure is held, not scarce, and
 * saying otherwise would be inventing urgency out of our own bookkeeping.
 */
export function buildFinalNoticeEmail(
  order: Order,
  appUrl: string,
): MailMessage {
  const shortId = order.id.slice(-8).toUpperCase();
  const items = order.items
    .map((i) => `${i.productName} (${i.packSizeLabel} × ${i.qty})`)
    .join(", ");

  const bodyHtml = `
    <p style="margin:0 0 18px;">Hello ${escapeHtml(order.customerName.split(" ")[0])} — order <strong>#${shortId}</strong> is still unpaid, and we release unpaid orders after 48 hours.</p>

    <p style="margin:0 0 18px;">${escapeHtml(items)} — ${formatPaise(order.totalPaise)} including shipping.</p>

    ${emailButton(`${appUrl}/cart`, "Complete your order")}

    <p style="margin:8px 0 0;font-size:14px;">
      Nothing is lost if you would rather not: the order simply lapses tomorrow, the packs go back on the shelf, and you can order again any time. There is nothing to cancel and nobody to tell.
    </p>
    <p style="margin:14px 0 0;font-size:14px;">
      If paying online is the problem, Cash on Delivery is available everywhere we ship in India.
    </p>
    <p style="margin:14px 0 0;font-size:14px;">
      This is the last we will write about this order.
    </p>`;

  const text = [
    `Order #${shortId} is still unpaid. We release unpaid orders after 48 hours.`,
    ``,
    `${items} — ${formatPaise(order.totalPaise)} including shipping.`,
    ``,
    `Complete it here: ${appUrl}/cart`,
    ``,
    `If you would rather not, do nothing — the order lapses tomorrow and the`,
    `packs go back on the shelf. There is nothing to cancel.`,
    ``,
    `This is the last we will write about this order.`,
  ].join("\n");

  return {
    to: order.customerEmail,
    subject: `Order #${shortId} lapses tomorrow`,
    html: renderEmailShell({
      previewText: `Unpaid orders are released after 48 hours.`,
      heading: "Your order lapses tomorrow",
      bodyHtml,
      appUrl,
    }),
    text,
  };
}
