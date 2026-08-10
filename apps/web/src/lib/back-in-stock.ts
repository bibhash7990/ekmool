import "server-only";
import {
  listPendingForVariant,
  markNotified,
} from "@/db/queries/back-in-stock";
import { buildBackInStockEmail } from "@/emails/back-in-stock";
import { sendAndLog } from "@/lib/mail";
import { appUrl } from "@/lib/env";

/**
 * Wakes the queue for a variant that has come back.
 *
 * Called from the admin stock edit and nowhere else — deliberately, not
 * from the paths that restore stock when an order is cancelled. A
 * cancellation puts one or two units back, and mailing forty waiting people
 * about one unit is a race thirty-nine of them lose. A deliberate restock
 * is when there is something to tell them about.
 *
 * Every send is logged and only the ones that actually left are stamped, so
 * an SMTP outage half way through the queue leaves the rest waiting rather
 * than silently marking them done. With no SMTP configured at all, the
 * provider reports `skipped_no_smtp` and nothing is stamped — the queue
 * simply keeps waiting until mail is set up, which is the honest behaviour
 * for a shop that has not finished configuring itself.
 */
export async function notifyBackInStock(variantId: number): Promise<{
  attempted: number;
  sent: number;
}> {
  const pending = await listPendingForVariant(variantId);
  if (pending.length === 0) return { attempted: 0, sent: 0 };

  const delivered: number[] = [];

  // Sequential, not Promise.all: this is one SMTP connection and a queue
  // of unknown length. Fanning out would hit the provider's rate limit and
  // turn a slow send into a failed one.
  for (const notification of pending) {
    const result = await sendAndLog(
      "back_in_stock",
      buildBackInStockEmail(notification, appUrl),
    );
    if (result.status === "sent") delivered.push(notification.id);
  }

  const stamped = await markNotified(delivered);

  console.info(
    `[back-in-stock] variant ${variantId}: ${pending.length} waiting, ${stamped} notified`,
  );

  return { attempted: pending.length, sent: stamped };
}
