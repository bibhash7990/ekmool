import { NextResponse, type NextRequest } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import {
  getOrderById,
  markOrderPaid,
  markPaymentFailed,
} from "@/db/queries/orders";
import { buildOrderConfirmedEmail } from "@/emails/order-confirmed";
import { sendAndLog } from "@/lib/mail";
import { appUrl, hasRazorpayWebhook } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
      };
    };
  };
}

/**
 * Razorpay webhook. Must respond in under 2 seconds, so all slow work
 * (email) is fired without awaiting.
 *
 * Idempotency is structural: orders.razorpay_payment_id is UNIQUE, so a
 * replayed delivery updates zero rows and we return 200 without acting
 * twice.
 */
export async function POST(request: NextRequest) {
  if (!hasRazorpayWebhook) {
    return NextResponse.json(
      { error: "Razorpay is not configured", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  // Raw body FIRST — parsing and re-serialising would break the HMAC.
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[webhook] signature verification failed");
    return NextResponse.json(
      { error: "Invalid signature", code: "INVALID_SIGNATURE" },
      { status: 400 },
    );
  }

  let event: RazorpayWebhookPayload;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "Malformed payload", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const payment = event.payload?.payment?.entity;
  const razorpayOrderId = payment?.order_id;
  const razorpayPaymentId = payment?.id;

  if (!razorpayOrderId || !razorpayPaymentId) {
    // Acknowledge events we do not handle so Razorpay stops retrying.
    return NextResponse.json({ received: true, handled: false });
  }

  try {
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const { transitioned, orderId } = await markOrderPaid(
        razorpayOrderId,
        razorpayPaymentId,
      );

      if (transitioned && orderId) {
        void (async () => {
          try {
            const order = await getOrderById(orderId);
            if (order) {
              await sendAndLog(
                "order_confirmed",
                buildOrderConfirmedEmail(order, appUrl),
                order.id,
              );
            }
          } catch (error) {
            console.error("[webhook] confirmation email failed:", error);
          }
        })();
      }

      return NextResponse.json({ received: true, transitioned });
    }

    if (event.event === "payment.failed") {
      await markPaymentFailed(razorpayOrderId);
      return NextResponse.json({ received: true, handled: true });
    }

    return NextResponse.json({ received: true, handled: false });
  } catch (error) {
    console.error("[webhook] processing failed:", error);
    // 500 asks Razorpay to retry — correct, since the payment is real
    // and our side failed to record it.
    return NextResponse.json(
      { error: "Processing failed", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
