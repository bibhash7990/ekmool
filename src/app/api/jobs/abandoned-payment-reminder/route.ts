import { NextResponse, type NextRequest } from "next/server";
import { authorizeJob } from "@/lib/jobs";
import {
  findAbandonedOrderIds,
  claimReminder,
  releaseReminder,
} from "@/db/queries/jobs";
import { getOrderById } from "@/db/queries/orders";
import { hasEmailBeenSent } from "@/db/queries/email-log";
import { buildPaymentReminderEmail } from "@/emails/payment-reminder";
import { sendAndLog } from "@/lib/mail";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly: chase orders whose online payment never completed.
 *
 * At most one reminder per order, guaranteed twice over — the atomic
 * claim on reminder_sent_at, and an email_log check in case the column
 * was ever reset by hand.
 */
export async function POST(request: NextRequest) {
  const unauthorized = authorizeJob(request);
  if (unauthorized) return unauthorized;

  try {
    const orderIds = await findAbandonedOrderIds();
    let sent = 0;
    let skipped = 0;

    for (const orderId of orderIds) {
      if (await hasEmailBeenSent(orderId, "payment_reminder")) {
        skipped += 1;
        continue;
      }

      // Claim first: if a concurrent run already took it, move on.
      if (!(await claimReminder(orderId))) {
        skipped += 1;
        continue;
      }

      const order = await getOrderById(orderId);
      if (!order) {
        skipped += 1;
        continue;
      }

      const result = await sendAndLog(
        "payment_reminder",
        buildPaymentReminderEmail(order, appUrl),
        order.id,
      );

      if (result.status === "failed") {
        // Give a later run the chance to retry.
        await releaseReminder(orderId);
      } else {
        sent += 1;
      }
    }

    return NextResponse.json({
      job: "abandoned-payment-reminder",
      candidates: orderIds.length,
      sent,
      skipped,
    });
  } catch (error) {
    console.error("[jobs] abandoned-payment-reminder failed:", error);
    return NextResponse.json(
      { error: "Job failed", code: "JOB_FAILED" },
      { status: 500 },
    );
  }
}

export const GET = POST;
