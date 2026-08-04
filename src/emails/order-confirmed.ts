import type { Order } from "@/db/queries/orders";
import { formatPaise } from "@/lib/money";
import type { MailMessage } from "@/lib/mail/provider";
import {
  renderEmailShell,
  emailButton,
  escapeHtml,
  EMAIL_COLORS as C,
} from "./layout";

export function buildOrderConfirmedEmail(
  order: Order,
  appUrl: string,
): MailMessage {
  const isCod = order.paymentMethod === "cod";
  const shortId = order.id.slice(-8).toUpperCase();

  const rows = order.items
    .map(
      (item) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${C.GREEN_200};">
          <div style="color:${C.GREEN_900};">${escapeHtml(item.productName)}</div>
          <div style="font-size:14px;">${escapeHtml(item.packSizeLabel)} &times; ${item.qty}</div>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${C.GREEN_200};color:${C.GREEN_900};white-space:nowrap;">
          ${formatPaise(item.lineTotalPaise)}
        </td>
      </tr>`,
    )
    .join("");

  const totalsRow = (label: string, value: string, bold = false) =>
    `<tr>
      <td style="padding:6px 0;${bold ? `color:${C.GREEN_900};font-weight:600;font-size:18px;` : ""}">${label}</td>
      <td align="right" style="padding:6px 0;white-space:nowrap;${bold ? `color:${C.GREEN_900};font-weight:600;font-size:18px;` : ""}">${value}</td>
    </tr>`;

  const bodyHtml = `
    <p style="margin:0 0 18px;">Thank you, ${escapeHtml(order.customerName.split(" ")[0])}. We have your order and will pack it within one working day.</p>

    <p style="margin:0 0 6px;font-size:14px;">Order reference</p>
    <p style="margin:0 0 24px;font-size:20px;color:${C.GREEN_900};letter-spacing:0.04em;">#${shortId}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.GREEN_200};">
      ${rows}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
      ${totalsRow("Subtotal", formatPaise(order.subtotalPaise))}
      ${totalsRow(
        "Shipping",
        order.shippingPaise === 0 ? "Free" : formatPaise(order.shippingPaise),
      )}
      ${totalsRow("Total", formatPaise(order.totalPaise), true)}
    </table>

    <p style="margin:22px 0 0;padding:14px 16px;background:#F7E8CB;color:${C.GREEN_900};font-size:15px;">
      ${
        isCod
          ? `Payment method: Cash on Delivery. Please keep ${formatPaise(order.totalPaise)} ready for the courier.`
          : `Payment received online. No further action needed.`
      }
    </p>

    <p style="margin:26px 0 6px;font-size:14px;">Delivering to</p>
    <p style="margin:0;color:${C.GREEN_900};line-height:1.5;">
      ${escapeHtml(order.customerName)}<br>
      ${escapeHtml(order.address.line1)}<br>
      ${order.address.line2 ? `${escapeHtml(order.address.line2)}<br>` : ""}
      ${escapeHtml(order.address.city)}, ${escapeHtml(order.address.state)} ${escapeHtml(order.address.pincode)}<br>
      ${escapeHtml(order.customerPhone)}
    </p>

    ${emailButton(`${appUrl}/order/${order.id}/confirmed`, "View your order")}

    <p style="margin:8px 0 0;font-size:14px;">
      Questions? Reply to this email or write to us from the
      <a href="${appUrl}/contact" style="color:${C.GREEN_700};">contact page</a>.
    </p>`;

  const text = [
    `Thank you, ${order.customerName.split(" ")[0]}.`,
    ``,
    `Order #${shortId}`,
    ...order.items.map(
      (i) =>
        `  ${i.productName} — ${i.packSizeLabel} x${i.qty} — ${formatPaise(i.lineTotalPaise)}`,
    ),
    ``,
    `Subtotal: ${formatPaise(order.subtotalPaise)}`,
    `Shipping: ${order.shippingPaise === 0 ? "Free" : formatPaise(order.shippingPaise)}`,
    `Total: ${formatPaise(order.totalPaise)}`,
    ``,
    isCod
      ? `Payment: Cash on Delivery — please keep ${formatPaise(order.totalPaise)} ready.`
      : `Payment: received online.`,
    ``,
    `Delivering to:`,
    `${order.customerName}`,
    `${order.address.line1}`,
    order.address.line2 ?? "",
    `${order.address.city}, ${order.address.state} ${order.address.pincode}`,
    `${order.customerPhone}`,
    ``,
    `View your order: ${appUrl}/order/${order.id}/confirmed`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    to: order.customerEmail,
    subject: `Order #${shortId} confirmed — Ekmool`,
    html: renderEmailShell({
      previewText: `Your Ekmool order #${shortId} is confirmed.`,
      heading: "Your order is confirmed",
      bodyHtml,
      appUrl,
    }),
    text,
  };
}
