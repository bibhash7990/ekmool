import type { MailMessage } from "@/lib/mail/provider";
import type { PendingNotification } from "@/db/queries/back-in-stock";
import { formatPaise } from "@/lib/money";
import { renderEmailShell, emailButton, escapeHtml } from "./layout";

/**
 * "The pack you wanted is back."
 *
 * Deliberately without a countdown, a reserved-for-you claim or a stock
 * number. We cannot hold a unit for someone who has not paid, and saying
 * otherwise to make them hurry would be a lie told for money. What the mail
 * does say is the honest version: everyone who asked was told at the same
 * time.
 */
export function buildBackInStockEmail(
  notification: PendingNotification,
  appUrl: string,
): MailMessage {
  const label = `${notification.productName} — ${notification.packSizeLabel}`;
  const url = `${appUrl}/products/${notification.productSlug}`;

  const bodyHtml = `
    <p style="margin:0 0 18px;">You asked us to tell you when this came back to the shelf. It has.</p>

    <p style="margin:0 0 6px;font-size:14px;">Back in stock</p>
    <p style="margin:0 0 20px;font-size:20px;color:#1C3A2D;">${escapeHtml(label)} — ${formatPaise(notification.pricePaise)}</p>

    ${emailButton(url, "See it on the site")}

    <p style="margin:8px 0 0;font-size:14px;">
      We have not set anything aside — everyone who asked about this pack got this email at the same time, and it is first come, first served.
    </p>
    <p style="margin:14px 0 0;font-size:14px;">
      This is a one-off note for the pack you asked about. You are not on a mailing list, and we have not added you to one.
    </p>`;

  const text = [
    `${label} is back in stock — ${formatPaise(notification.pricePaise)}.`,
    ``,
    `You asked us to tell you when it returned.`,
    ``,
    url,
    ``,
    `Nothing has been set aside: everyone who asked was emailed at the same time.`,
    `This is a one-off note about that pack. You are not on a mailing list.`,
  ].join("\n");

  return {
    to: notification.email,
    subject: `${notification.productName} (${notification.packSizeLabel}) is back`,
    html: renderEmailShell({
      previewText: `${label} is back on the shelf.`,
      heading: "It is back on the shelf",
      bodyHtml,
      appUrl,
    }),
    text,
  };
}
