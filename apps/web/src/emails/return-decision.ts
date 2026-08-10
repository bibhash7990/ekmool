import type { MailMessage } from "@/lib/mail/provider";
import type { ReturnStatus } from "@/db/queries/returns";
import { formatPaise } from "@/lib/money";
import {
  renderEmailShell,
  emailButton,
  escapeHtml,
  EMAIL_COLORS as C,
} from "./layout";

/**
 * Telling the customer what was decided about their return.
 *
 * Every one of these says what happens next, because "your return has been
 * approved" with no instruction is a message that generates a support
 * email. The declined wording is the one worth reading twice: it gives the
 * reason the owner actually typed, and it does not apologise its way around
 * the decision. A person who has been told no deserves to know why and to
 * be told plainly.
 */

interface Copy {
  subject: string;
  heading: string;
  lead: string;
  next: string;
}

function copyFor(
  status: ReturnStatus,
  firstName: string,
  reference: string,
  totalPaise: number,
): Copy | null {
  switch (status) {
    case "approved":
      return {
        subject: `Return approved — order #${reference}`,
        heading: "Your return is approved",
        lead: `${firstName}, we have approved the return on order #${reference}.`,
        next: "Pack the item as securely as it arrived and send it back to the address on your invoice. Reply to this email with the courier's tracking number and we will watch for it. Once it reaches us we will confirm, and the refund follows within three working days.",
      };
    case "received":
      return {
        subject: `We have your return — order #${reference}`,
        heading: "Your parcel is back with us",
        lead: `${firstName}, the return for order #${reference} has arrived and been checked.`,
        next: `The refund of ${formatPaise(totalPaise)} is being processed now. Card and UPI refunds take three to five working days to appear, depending on your bank — we will email you the moment it is sent.`,
      };
    case "refunded":
      return {
        subject: `Refunded ${formatPaise(totalPaise)} — order #${reference}`,
        heading: "Your refund is on its way",
        lead: `${firstName}, we have refunded ${formatPaise(totalPaise)} on order #${reference}.`,
        next: "It takes three to five working days to show up, and it goes back the way it came — to the card or account you paid from. If it has not arrived after five working days, reply to this email and we will chase it with our payment provider.",
      };
    case "rejected":
      return {
        subject: `About your return — order #${reference}`,
        heading: "We cannot accept this return",
        lead: `${firstName}, we have looked at the return you raised on order #${reference}, and we are not able to accept it.`,
        next: "The reason is below. If you think we have got this wrong — and we do sometimes — reply to this email and a person will read it. We would rather sort it out than leave you unhappy with something you paid for.",
      };
    // 'requested' is the customer's own action, not a decision, so there is
    // nothing to tell them that they do not already know.
    case "requested":
      return null;
  }
}

export function buildReturnDecisionEmail(params: {
  status: ReturnStatus;
  orderId: string;
  customerName: string;
  customerEmail: string;
  totalPaise: number;
  resolution: string | null;
  appUrl: string;
}): MailMessage | null {
  const reference = params.orderId.slice(-8).toUpperCase();
  const firstName = params.customerName.trim().split(/\s+/)[0] || "there";
  const copy = copyFor(
    params.status,
    firstName,
    reference,
    params.totalPaise,
  );
  if (!copy) return null;

  const bodyHtml = `
    <p style="margin:0 0 18px;">${escapeHtml(copy.lead)}</p>

    ${
      params.resolution
        ? `<p style="margin:0 0 18px;padding:14px 16px;background:#F7E8CB;color:${C.GREEN_900};font-size:15px;">${escapeHtml(params.resolution)}</p>`
        : ""
    }

    <p style="margin:0 0 18px;">${escapeHtml(copy.next)}</p>

    ${emailButton(`${params.appUrl}/orders/${params.orderId}`, "View your order")}`;

  const text = [
    copy.lead,
    ``,
    params.resolution ?? ``,
    params.resolution ? `` : ``,
    copy.next,
    ``,
    `View your order: ${params.appUrl}/orders/${params.orderId}`,
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");

  return {
    to: params.customerEmail,
    subject: `${copy.subject} — Ekmool`,
    html: renderEmailShell({
      previewText: copy.lead,
      heading: copy.heading,
      bodyHtml,
      appUrl: params.appUrl,
    }),
    text,
  };
}
