import type { Order } from "@/db/queries/orders";
import { formatPaise } from "@/lib/money";
import type { MailMessage } from "@/lib/mail/provider";
import { renderEmailShell, emailButton, escapeHtml } from "./layout";

export function buildPaymentReminderEmail(
  order: Order,
  appUrl: string,
): MailMessage {
  const shortId = order.id.slice(-8).toUpperCase();
  const items = order.items
    .map((i) => `${i.productName} (${i.packSizeLabel} × ${i.qty})`)
    .join(", ");

  const bodyHtml = `
    <p style="margin:0 0 18px;">Hello ${escapeHtml(order.customerName.split(" ")[0])} — you started an order with us but the payment did not go through. We have kept it aside for you.</p>

    <p style="margin:0 0 6px;font-size:14px;">Order reference</p>
    <p style="margin:0 0 20px;font-size:20px;color:#1C3A2D;letter-spacing:0.04em;">#${shortId}</p>

    <p style="margin:0;">${escapeHtml(items)} — ${formatPaise(order.totalPaise)} including shipping.</p>

    ${emailButton(`${appUrl}/cart`, "Complete your order")}

    <p style="margin:8px 0 0;font-size:14px;">
      If you would rather pay on delivery, choose Cash on Delivery at checkout — it is available everywhere we ship in India.
    </p>
    <p style="margin:14px 0 0;font-size:14px;">
      This is the only reminder we will send. If you have changed your mind, you can safely ignore it and the order will be released in 48 hours.
    </p>`;

  const text = [
    `Hello ${order.customerName.split(" ")[0]} — your Ekmool order #${shortId} is not paid yet.`,
    ``,
    `${items} — ${formatPaise(order.totalPaise)} including shipping.`,
    ``,
    `Complete it here: ${appUrl}/cart`,
    ``,
    `Prefer to pay on delivery? Choose Cash on Delivery at checkout.`,
    `This is the only reminder we will send; unpaid orders are released after 48 hours.`,
  ].join("\n");

  return {
    to: order.customerEmail,
    subject: `Your Ekmool order #${shortId} is waiting`,
    html: renderEmailShell({
      previewText: `Order #${shortId} is still waiting for payment.`,
      heading: "Your order is still waiting",
      bodyHtml,
      appUrl,
    }),
    text,
  };
}
