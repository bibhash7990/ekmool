import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requestBackInStock } from "@/db/queries/back-in-stock";
import { DbUnconfiguredError } from "@/db/pool";
import { verifyChallenge } from "@/lib/turnstile";
import { HONEYPOT_FIELD } from "@/lib/honeypot";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Tell me when this pack is back."
 *
 * The abuse worth thinking about is signing up someone else's address. It
 * is bounded here rather than prevented: one row per address per variant,
 * one email ever, and that email says plainly that it is a one-off about a
 * specific pack and that nobody has been added to a list. The alternative,
 * a confirmation round trip, would mean sending the stranger an email to
 * ask whether they want an email — which is the thing we were trying not
 * to do.
 */

const schema = z.object({
  variantId: z.coerce.number().int().positive(),
  email: z.email("Enter an email address we can reach you at").max(200),
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

  const envelope = (payload ?? {}) as Record<string, unknown>;
  const challenge = await verifyChallenge({
    honeypot: envelope[HONEYPOT_FIELD],
    token: envelope.turnstileToken,
    ip: clientIp(request.headers),
  });
  if (!challenge.ok) {
    return NextResponse.json(
      {
        error: "We could not verify that request. Please try again.",
        code: "CHALLENGE_FAILED",
      },
      { status: 400 },
    );
  }

  const parsed = schema.safeParse(payload);
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
    const outcome = await requestBackInStock(parsed.data);

    if (outcome === "unknown_variant") {
      return NextResponse.json(
        { error: "That pack is not one we sell.", code: "UNKNOWN_VARIANT" },
        { status: 404 },
      );
    }

    // Good news delivered as a 409. The product page is served from an
    // hourly cache, so someone can submit this form minutes after the pack
    // came back — and being told "you are on the list" for something they
    // could buy right now would be the wrong answer twice over.
    if (outcome === "in_stock") {
      return NextResponse.json(
        {
          error:
            "That pack is back in stock — refresh the page and you can order it now.",
          code: "IN_STOCK",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        code: outcome.toUpperCase(),
        message:
          outcome === "already_waiting"
            ? "You are already on the list for this pack — we will write once, the day it is back."
            : "Done. We will write to you once, the day this pack is back.",
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[back-in-stock] database unavailable:", error);
      return NextResponse.json(
        {
          error: "We cannot take that just now. Please try again shortly.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    console.error("[back-in-stock] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
