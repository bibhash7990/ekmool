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
import { moderateReview } from "@/db/queries/reviews";
import { createCoupon, setCouponActive } from "@/db/queries/coupons";
import { decideReturn, type ReturnStatus } from "@/db/queries/returns";
import { recordAdminAction } from "@/db/queries/audit";
import { buildOrderShippedEmail } from "@/emails/order-shipped";
import { buildReturnDecisionEmail } from "@/emails/return-decision";
import { notifyBackInStock } from "@/lib/back-in-stock";
import { sendAndLog } from "@/lib/mail";
import { revalidateCatalog, revalidateReviews } from "@/lib/revalidate";
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

    await recordAdminAction({
      actor: userId,
      action: result.changed ? "order.status" : "order.tracking",
      entityType: "order",
      entityId: orderId,
      summary: result.changed
        ? `Order ${orderId.slice(-8).toUpperCase()}: ${result.previous} → ${status}`
        : `Order ${orderId.slice(-8).toUpperCase()}: tracking updated`,
      detail: result.changed
        ? { status: { from: result.previous, to: status } }
        : null,
    });

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
  const { userId } = await requireAdmin();

  const parsed = stockSchema.safeParse({
    variantId: formData.get("variantId"),
    stockQty: formData.get("stockQty"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Enter a whole number of units, 0 or more." };
  }

  try {
    const result = await setVariantStock(
      parsed.data.variantId,
      parsed.data.stockQty,
    );
    if (!result.updated) return { ok: false, message: "Variant not found" };

    // An admin edit is exactly the case where purging the catalogue is
    // correct: it is rare, deliberate, and should show up immediately.
    revalidateCatalog();
    revalidatePath("/admin/stock");

    // Nothing to something: the pack is back, so tell the people who asked.
    // Awaited rather than fired and forgotten, because the owner needs the
    // count in the reply — "stock set to 40" with no mention of the twelve
    // emails it just sent is a surprise waiting to happen.
    let notified = "";
    if (result.previous === 0 && result.next > 0) {
      try {
        const { sent } = await notifyBackInStock(parsed.data.variantId);
        if (sent > 0) {
          notified = ` ${sent} waiting ${sent === 1 ? "customer" : "customers"} notified.`;
        }
      } catch (error) {
        // The stock change is committed and correct; a mail failure must
        // not report it as one. The queue is untouched, so the next
        // restock — or a retry — picks it up.
        console.error("[admin] back-in-stock notification failed:", error);
        notified = " Stock saved, but the waiting-list email did not send.";
      }
    }

    await recordAdminAction({
      actor: userId,
      action: "variant.stock",
      entityType: "variant",
      entityId: parsed.data.variantId,
      summary: `Stock ${result.previous} → ${result.next}`,
      detail: { stockQty: { from: result.previous, to: result.next } },
    });

    return {
      ok: true,
      message: `Stock set to ${parsed.data.stockQty}.${notified}`,
    };
  } catch (error) {
    console.error("[admin] stock update failed:", error);
    return { ok: false, message: "Could not update stock. Try again." };
  }
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */

const moderationSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["published", "rejected"]),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

/**
 * Publishing or rejecting a review.
 *
 * revalidateReviews() and not revalidateCatalog(): the two are separate
 * tags precisely so moderating a review does not purge the catalogue cache
 * and send every product page back to the database. And neither of them
 * touches revalidatePath for /products/[slug] — see src/lib/revalidate.ts
 * for why that would 404 the page permanently.
 */
export async function moderateReviewAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = moderationSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Could not read that decision." };
  }

  try {
    const changed = await moderateReview(
      parsed.data.id,
      parsed.data.status,
      parsed.data.note || null,
    );
    if (!changed) return { ok: false, message: "Review not found." };

    await recordAdminAction({
      actor: userId,
      action: `review.${parsed.data.status}`,
      entityType: "review",
      entityId: parsed.data.id,
      summary: `Review ${parsed.data.status}`,
      // The moderator's note, but never the review body. The review is in
      // the reviews table; copying somebody's words into a second table is
      // a second place they have to be erased from.
      detail: parsed.data.note ? { note: parsed.data.note } : null,
    });

    revalidateReviews();
    revalidatePath("/admin/reviews");

    return {
      ok: true,
      message:
        parsed.data.status === "published"
          ? "Published. It is on the product page within the hour, or immediately on the next request."
          : "Rejected. It stays on record and is not shown anywhere.",
    };
  } catch (error) {
    console.error("[admin] review moderation failed:", error);
    return { ok: false, message: "Could not save that. Try again." };
  }
}

/* ------------------------------------------------------------------ */
/* Coupons                                                             */

/**
 * Rupees in the form, paise in the database. The owner types 150, not
 * 15000 — asking a human to think in paise is how a coupon ends up a
 * hundred times too generous.
 */
const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,40}$/, "Letters, digits and hyphens only"),
    description: z.string().trim().min(3, "Say what it does").max(160),
    kind: z.enum(["percent", "flat", "free_shipping"]),
    percent: z.coerce.number().min(0).max(90).optional(),
    amountRupees: z.coerce.number().int().min(0).max(100000).optional(),
    maxDiscountRupees: z.coerce.number().int().min(0).max(100000).optional(),
    minSubtotalRupees: z.coerce.number().int().min(0).max(1000000).optional(),
    endsAt: z.string().trim().optional().or(z.literal("")),
    globalLimit: z.coerce.number().int().min(0).max(1000000).optional(),
    perCustomerLimit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine(
    (value) => value.kind !== "percent" || (value.percent ?? 0) > 0,
    { message: "A percentage coupon needs a percentage", path: ["percent"] },
  )
  .refine(
    (value) => value.kind !== "flat" || (value.amountRupees ?? 0) > 0,
    { message: "A flat coupon needs an amount", path: ["amountRupees"] },
  );

export async function createCouponAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = couponSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the fields.",
    };
  }

  const input = parsed.data;

  try {
    await createCoupon({
      code: input.code,
      description: input.description,
      kind: input.kind,
      percentBps:
        input.kind === "percent" ? Math.round((input.percent ?? 0) * 100) : null,
      amountPaise:
        input.kind === "flat" ? (input.amountRupees ?? 0) * 100 : null,
      maxDiscountPaise: input.maxDiscountRupees
        ? input.maxDiscountRupees * 100
        : null,
      minSubtotalPaise: (input.minSubtotalRupees ?? 0) * 100,
      // A date with no time means end of that day, not the stroke of
      // midnight at its start — otherwise "ends 31 March" would already
      // have ended for the whole of the 31st.
      endsAt: input.endsAt ? new Date(`${input.endsAt}T23:59:59`) : null,
      globalLimit: input.globalLimit ? input.globalLimit : null,
      perCustomerLimit: input.perCustomerLimit ?? 1,
    });

    await recordAdminAction({
      actor: userId,
      action: "coupon.create",
      entityType: "coupon",
      entityId: input.code,
      summary: `Created ${input.code} — ${input.description}`,
      detail: {
        kind: input.kind,
        percent: input.percent ?? null,
        amountRupees: input.amountRupees ?? null,
        minSubtotalRupees: input.minSubtotalRupees ?? 0,
        globalLimit: input.globalLimit ?? null,
      },
    });

    revalidatePath("/admin/coupons");
    return { ok: true, message: `${input.code} created and live.` };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY") {
      return { ok: false, message: `${input.code} already exists.` };
    }
    console.error("[admin] coupon creation failed:", error);
    return { ok: false, message: "Could not create that coupon." };
  }
}

export async function toggleCouponAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "Unknown coupon." };
  }

  try {
    const changed = await setCouponActive(id, active);
    if (!changed) return { ok: false, message: "Coupon not found." };

    await recordAdminAction({
      actor: userId,
      action: active ? "coupon.enable" : "coupon.disable",
      entityType: "coupon",
      entityId: id,
      summary: `Coupon switched ${active ? "on" : "off"}`,
    });

    revalidatePath("/admin/coupons");
    return {
      ok: true,
      message: active
        ? "Switched on."
        : "Switched off. Orders that already used it are untouched.",
    };
  } catch (error) {
    console.error("[admin] coupon toggle failed:", error);
    return { ok: false, message: "Could not change that." };
  }
}

/* ------------------------------------------------------------------ */
/* Returns                                                             */

const returnSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["approved", "rejected", "received", "refunded"]),
  resolution: z.string().trim().max(1000).optional().or(z.literal("")),
});

/**
 * Deciding a return.
 *
 * Declining one requires a reason. That is not politeness for its own sake:
 * a refusal with no explanation is what turns a return into a chargeback,
 * and the customer is going to ask anyway — better in the email they
 * already have than in a support thread three days later.
 *
 * The email is sent after the transaction commits and its failure is
 * reported rather than thrown. A decision that is recorded but not
 * delivered is recoverable; one that is rolled back because the mail server
 * was down leaves the owner thinking they have dealt with it.
 */
export async function decideReturnAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = returnSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    resolution: formData.get("resolution"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Could not read that decision." };
  }

  const { id, status } = parsed.data;
  const resolution = parsed.data.resolution || null;

  if (status === "rejected" && !resolution) {
    return {
      ok: false,
      message: "Say why. The customer is told this, and 'no' on its own is not an answer.",
    };
  }

  try {
    const result = await decideReturn({
      id,
      status: status as ReturnStatus,
      resolution,
      actor: `admin:${userId}`,
    });

    if (!result.ok) {
      return {
        ok: false,
        message:
          result.reason === "not_found"
            ? "That return no longer exists."
            : `This return is already ${result.from}, and that cannot be undone from here.`,
      };
    }

    await recordAdminAction({
      actor: userId,
      action: `return.${status}`,
      entityType: "return",
      entityId: id,
      summary: `Return on ${result.orderId.slice(-8).toUpperCase()}: ${result.previous} → ${status}`,
      detail: {
        status: { from: result.previous, to: status },
        orderMarkedRefunded: result.orderMarkedRefunded,
      },
    });

    let emailNote = "";
    const message = buildReturnDecisionEmail({
      status: status as ReturnStatus,
      orderId: result.orderId,
      customerName: result.customerName,
      customerEmail: result.customerEmail,
      totalPaise: result.totalPaise,
      resolution,
      appUrl,
    });

    if (message) {
      try {
        const mail = await sendAndLog(
          `return_${status}`,
          message,
          result.orderId,
        );
        emailNote =
          mail.status === "sent"
            ? " The customer has been emailed."
            : mail.status === "skipped_no_smtp"
              ? " Email logged only — no SMTP configured, so tell them yourself."
              : " The email failed to send — see email_log, and tell them yourself.";
      } catch (error) {
        console.error("[admin] return decision email failed:", error);
        emailNote = " Saved, but the email did not send.";
      }
    }

    revalidatePath("/admin/returns");
    revalidatePath("/admin");

    return {
      ok: true,
      message:
        (result.orderMarkedRefunded
          ? "Marked refunded, and the order's payment status with it."
          : `Marked ${status}.`) + emailNote,
    };
  } catch (error) {
    console.error("[admin] return decision failed:", error);
    return { ok: false, message: "Could not save that decision." };
  }
}
