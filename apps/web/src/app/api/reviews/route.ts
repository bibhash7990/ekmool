import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustomerEmail } from "@/lib/account";
import { findReviewableOrder, submitReview } from "@/db/queries/reviews";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Submitting a review, and asking whether you may.
 *
 * Eligibility is never taken from the request. The email comes from the
 * session cookie, and the order is found by a query that requires it to be
 * delivered and to have contained the product. There is no parameter a
 * caller can set to become a verified buyer.
 *
 * Everything lands as `pending`. Nothing a stranger typed appears on a
 * product page until the owner has read it.
 */

const submitSchema = z.object({
  productSlug: z.string().regex(/^[a-z0-9-]{1,120}$/),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(3, "Give it a short headline").max(120),
  body: z
    .string()
    .trim()
    .min(20, "A sentence or two helps the next person")
    .max(2000),
});

function failure(error: unknown): NextResponse {
  if (
    error instanceof DbUnconfiguredError ||
    (error instanceof Error && "code" in error)
  ) {
    console.error("[reviews] database unavailable:", error);
    return NextResponse.json(
      { error: "Reviews are unavailable just now.", code: "DB_UNAVAILABLE" },
      { status: 503 },
    );
  }
  console.error("[reviews] unexpected failure:", error);
  return NextResponse.json(
    { error: "Something went wrong.", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

/** May the signed-in customer review this product? */
export async function GET(request: Request) {
  const productSlug = new URL(request.url).searchParams.get("productSlug") ?? "";
  if (!/^[a-z0-9-]{1,120}$/.test(productSlug)) {
    return NextResponse.json(
      { error: "Unknown product", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const email = await getCustomerEmail();
  if (!email) {
    return NextResponse.json(
      { eligible: false, reason: "NO_SESSION" },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const order = await findReviewableOrder({ email, productSlug });
    return NextResponse.json(
      {
        eligible: order !== null && !order.alreadyReviewed,
        reason:
          order === null
            ? "NOT_DELIVERED"
            : order.alreadyReviewed
              ? "ALREADY_REVIEWED"
              : null,
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const email = await getCustomerEmail();
  if (!email) {
    return NextResponse.json(
      {
        error:
          "Find your order at /track first — we only publish reviews from people who received the product.",
        code: "NO_SESSION",
      },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const parsed = submitSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields",
        code: "VALIDATION_FAILED",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const outcome = await submitReview({ email, ...parsed.data });

    if (outcome === "not_eligible") {
      return NextResponse.json(
        {
          error:
            "We can only publish reviews from a delivered order containing this product.",
          code: "NOT_ELIGIBLE",
        },
        { status: 403 },
      );
    }

    if (outcome === "already_reviewed") {
      return NextResponse.json(
        {
          error: "You have already reviewed this product from that order.",
          code: "ALREADY_REVIEWED",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        code: "SUBMITTED",
        message:
          "Thank you — we read every review before it goes up, so it will appear shortly.",
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
