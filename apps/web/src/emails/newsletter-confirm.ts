import type { MailMessage } from "@/lib/mail/provider";
import { renderEmailShell, emailButton, escapeHtml } from "./layout";

/**
 * The one email a pending subscriber ever gets.
 *
 * It says plainly that somebody typed this address into a form and that
 * ignoring it is a complete answer — because it may well not have been
 * them who typed it, and the honest way to handle that is to make doing
 * nothing the safe default rather than to ask them to opt out of something
 * they never opted into.
 */
export function buildNewsletterConfirmEmail(
  email: string,
  token: string,
  appUrl: string,
): MailMessage {
  const confirmUrl = `${appUrl}/newsletter/confirm?token=${token}`;

  const bodyHtml = `
    <p style="margin:0 0 18px;">Someone — we hope you — asked for the Ekmool letter at <strong>${escapeHtml(email)}</strong>.</p>

    <p style="margin:0 0 18px;">We send it rarely: when a harvest lands, when a batch is milled, and when something worth reading about one of the five origins turns up. No sale countdowns.</p>

    ${emailButton(confirmUrl, "Yes, sign me up")}

    <p style="margin:8px 0 0;font-size:14px;">
      If that was not you, do nothing at all. We have not added you to anything, and without this click we never will. The request expires on its own.
    </p>`;

  const text = [
    `Someone asked for the Ekmool letter at ${email}.`,
    ``,
    `Confirm here: ${confirmUrl}`,
    ``,
    `If that was not you, do nothing. We have not added you to anything,`,
    `and without this click we never will.`,
  ].join("\n");

  return {
    to: email,
    subject: "Confirm your Ekmool letter",
    html: renderEmailShell({
      previewText: "One click to confirm — or ignore this and nothing happens.",
      heading: "Confirm your subscription",
      bodyHtml,
      appUrl,
    }),
    text,
  };
}
