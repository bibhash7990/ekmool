import "server-only";
import Razorpay from "razorpay";
import { hasRazorpay } from "@/lib/env";
import { hmacSha256Hex, timingSafeEquals } from "@/lib/crypto";

/**
 * Razorpay is optional. The SDK client is constructed lazily so importing
 * this module never throws when keys are absent — checkout simply offers
 * COD only and the webhook reports NOT_CONFIGURED.
 */

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!hasRazorpay) {
    throw new Error("Razorpay is not configured");
  }
  if (!client) {
    client = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
  }
  return client;
}

/** Creates a Razorpay order for an already-persisted Ekmool order. */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  receipt: string;
}): Promise<{ id: string }> {
  const order = await getClient().orders.create({
    amount: params.amountPaise,
    currency: "INR",
    receipt: params.receipt,
    payment_capture: true,
  });
  return { id: order.id };
}

/**
 * Verifies a webhook signature against the RAW request body.
 *
 * The body must never be JSON.parse'd and re-stringified before this
 * runs — key order and whitespace would change and the HMAC would not
 * match.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (!secret || !signature) return false;
  return timingSafeEquals(hmacSha256Hex(rawBody, secret), signature);
}
