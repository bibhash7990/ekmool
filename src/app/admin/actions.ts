"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  updateOrderStatus,
  setVariantStock,
  isOrderStatus,
} from "@/db/queries/admin";
import { getOrderById } from "@/db/queries/orders";
import { buildOrderShippedEmail } from "@/emails/order-shipped";
import { sendAndLog } from "@/lib/mail";
import { revalidateCatalog } from "@/lib/revalidate";
import { appUrl } from "@/lib/env";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const statusSchema = z.object({
  orderId: z.string().length(26),
  status: z.string().refine(isOrderStatus, "Unknown status"),
  trackingId: z.string().trim().max(120).optional(),
});

/**
 * Applies a status change and, on the transition into "shipped", sends
 * the customer their shipping email — once. Re-saving a shipped order
 * does not re-send, because updateOrderStatus reports whether the status
 * actually changed.
 */
export async function updateOrderStatusAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = statusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    trackingId: formData.get("trackingId") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { orderId, status, trackingId } = parsed.data;

  try {
    const result = await updateOrderStatus({
      orderId,
      status: status as Parameters<typeof updateOrderStatus>[0]["status"],
      trackingId: trackingId ?? null,
      actor: `admin:${userId}`,
    });

    if (result.previous === null) {
      return { ok: false, message: "Order not found" };
    }

    let emailNote = "";
    if (result.changed && status === "shipped") {
      const order = await getOrderById(orderId);
      if (order) {
        const mail = await sendAndLog(
          "order_shipped",
          buildOrderShippedEmail(order, appUrl),
          order.id,
        );
        emailNote =
          mail.status === "sent"
            ? " Shipping email sent."
            : mail.status === "skipped_no_smtp"
              ? " Shipping email logged (no SMTP configured)."
              : " Shipping email failed — see email_log.";
      }
    }

    revalidatePath("/admin");

    return {
      ok: true,
      message: result.changed
        ? `Status set to ${status}.${emailNote}`
        : "Tracking updated.",
    };
  } catch (error) {
    console.error("[admin] status update failed:", error);
    return { ok: false, message: "Could not update the order. Try again." };
  }
}

const stockSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  stockQty: z.coerce.number().int().min(0).max(100000),
});

export async function updateStockAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = stockSchema.safeParse({
    variantId: formData.get("variantId"),
    stockQty: formData.get("stockQty"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Enter a whole number of units, 0 or more." };
  }

  try {
    const updated = await setVariantStock(
      parsed.data.variantId,
      parsed.data.stockQty,
    );
    if (!updated) return { ok: false, message: "Variant not found" };

    // An admin edit is exactly the case where purging the catalogue is
    // correct: it is rare, deliberate, and should show up immediately.
    revalidateCatalog();
    revalidatePath("/admin/stock");

    return { ok: true, message: `Stock set to ${parsed.data.stockQty}.` };
  } catch (error) {
    console.error("[admin] stock update failed:", error);
    return { ok: false, message: "Could not update stock. Try again." };
  }
}
