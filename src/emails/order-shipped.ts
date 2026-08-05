import type { Order } from "@/db/queries/orders";
import type { MailMessage } from "@/lib/mail/provider";
import {
  renderEmailShell,
  emailButton,
  escapeHtml,
  EMAIL_COLORS as C,
} from "./layout";

export function buildOrderShippedEmail(
  order: Order,
  appUrl: string,
): MailMessage {
  const shortId = order.id.slice(-8).toUpperCase();
  const items = order.items
    .map((i) => `${i.productName} (${i.packSizeLabel} × ${i.qty})`)
    .join(", ");

  const bodyHtml = `
    <p style="margin:0 0 18px;">Good news, ${escapeHtml(order.customerName.split(" ")[0])} — order <strong style="color:${C.GREEN_900};">#${shortId}</strong> has left us and is on its way.</p>

    ${
      order.trackingId
        ? `<p style="margin:0 0 6px;font-size:14px;">Tracking number</p>
           <p style="margin:0 0 8px;font-size:20px;color:${C.GREEN_900};letter-spacing:0.04em;">${escapeHtml(order.trackingId)}</p>
           <p style="margin:0;font-size:14px;">Tracking can take a few hours to show its first scan — that is normal.</p>`
        : `<p style="margin:0;font-size:15px;">We will send your tracking number as soon as the courier issues it.</p>`
    }

    <p style="margin:22px 0 0;padding:14px 16px;background:#F7E8CB;color:${C.GREEN_900};font-size:15px;">
      In the parcel: ${escapeHtml(items)}
    </p>

    <p style="margin:24px 0 0;">Delivering to ${escapeHtml(order.address.city)}, ${escapeHtml(order.address.state)} ${escapeHtml(order.address.pincode)}. Please keep the number ending ${escapeHtml(order.customerPhone.slice(-4))} reachable — most missed deliveries in India are missed phone calls.</p>

    ${
      order.paymentMethod === "cod"
        ? `<p style="margin:18px 0 0;">This is a Cash on Delivery order, so please have the payment ready for the courier.</p>`
        : ""
    }

    ${emailButton(`${appUrl}/orders/${order.id}`, "View your order")}

    <p style="margin:8px 0 0;font-size:14px;">
      Once it arrives, store spices airtight and away from heat — not on the shelf above the hob.
    </p>`;

  const text = [
    `Good news, ${order.customerName.split(" ")[0]} — order #${shortId} has shipped.`,
    ``,
    order.trackingId
      ? `Tracking number: ${order.trackingId}`
      : `We will send your tracking number as soon as the courier issues it.`,
    ``,
    `In the parcel: ${items}`,
    ``,
    `Delivering to ${order.address.city}, ${order.address.state} ${order.address.pincode}.`,
    order.paymentMethod === "cod"
      ? `This is a Cash on Delivery order — please have the payment ready.`
      : ``,
    ``,
    `View your order: ${appUrl}/orders/${order.id}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    to: order.customerEmail,
    subject: `Order #${shortId} is on its way — Ekmool`,
    html: renderEmailShell({
      previewText: `Your Ekmool order #${shortId} has shipped.`,
      heading: "Your order has shipped",
      bodyHtml,
      appUrl,
    }),
    text,
  };
}
