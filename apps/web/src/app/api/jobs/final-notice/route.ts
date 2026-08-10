import { NextResponse, type NextRequest } from "next/server";
import { authorizeJob } from "@/lib/jobs";
import {
  findFinalNoticeOrderIds,
  claimFinalNotice,
  releaseFinalNotice,
} from "@/db/queries/jobs";
import { getOrderById } from "@/db/queries/orders";
import { hasEmailBeenSent } from "@/db/queries/email-log";
import { buildFinalNoticeEmail } from "@/emails/final-notice";
import { sendAndLog } from "@/lib/mail";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Hourly: the last word on an order that is about to be released.
 *
 * Same shape as abandoned-payment-reminder — claim atomically, send, put
 * the claim back if the send failed — on its own column, so the two can
 * never chase the same order twice between them.
 */
export async function POST(request: NextRequest) {
  const unauthorized = authorizeJob(request);
  if (unauthorized) return unauthorized;

  try {
    const orderIds = await findFinalNoticeOrderIds();
    let sent = 0;
    let skipped = 0;

    for (const orderId of orderIds) {
      if (await hasEmailBeenSent(orderId, "final_notice")) {
        skipped += 1;
        continue;
      }

      if (!(await claimFinalNotice(orderId))) {
        skipped += 1;
        continue;
      }

      const order = await getOrderById(orderId);
      if (!order) {
        skipped += 1;
        continue;
      }

      const result = await sendAndLog(
        "final_notice",
        buildFinalNoticeEmail(order, appUrl),
        order.id,
      );

      if (result.status === "failed") {
        await releaseFinalNotice(orderId);
      } else {
        sent += 1;
      }
    }

    return NextResponse.json({
      job: "final-notice",
      candidates: orderIds.length,
      sent,
      skipped,
    });
  } catch (error) {
    console.error("[jobs] final-notice failed:", error);
    return NextResponse.json(
      { error: "Job failed", code: "JOB_FAILED" },
      { status: 500 },
    );
  }
}

export const GET = POST;
