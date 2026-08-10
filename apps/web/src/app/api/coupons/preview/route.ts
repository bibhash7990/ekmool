import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { previewCoupon, subtotalForItems } from "@/db/queries/coupons";
import { couponRefusalMessage } from "@/lib/coupons";
import { couponCodeSchema } from "@/lib/validation/checkout";
import { shippingFor } from "@/db/queries/orders";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a code is worth, before the customer commits to it.
 *
 * **This endpoint decides nothing.** Checkout re-runs every rule against a
 * locked coupon row, so a code that passes here can still be refused there
 * — exhausted by someone else in between, expired on the stroke, or applied
 * to a basket that changed. The reply is a quote, not a reservation, and
 * the cart says so.
 *
 * The subtotal is recomputed from the database rather than taken from the
 * request: a client that could name its own subtotal could name one just
 * above a coupon's minimum.
 */

const schema = z.object({
  code: couponCodeSchema,
  items: z
    .array(
      z.object({
        variantId: z.number().int().positive(),
        qty: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the code and try again", code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  try {
    const subtotalPaise = await subtotalForItems(parsed.data.items);

    const result = await previewCoupon({
      code: parsed.data.code,
      subtotalPaise,
      shippingPaise: shippingFor(subtotalPaise),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          code: "COUPON_REFUSED",
          reason: result.reason,
          error: couponRefusalMessage(result.reason, {
            minSubtotalPaise: result.coupon?.minSubtotalPaise,
          }),
        },
        { status: 200, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        code: "COUPON_OK",
        couponCode: result.coupon.code,
        description: result.coupon.description,
        goodsDiscountPaise: result.benefit.goodsDiscountPaise,
        shippingWaivedPaise: result.benefit.shippingWaivedPaise,
        benefitPaise: result.benefit.benefitPaise,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[coupons/preview] database unavailable:", error);
      return NextResponse.json(
        { error: "Codes cannot be checked just now.", code: "DB_UNAVAILABLE" },
        { status: 503 },
      );
    }
    console.error("[coupons/preview] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
