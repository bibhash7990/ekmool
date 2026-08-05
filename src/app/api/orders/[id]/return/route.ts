import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createReturnRequest,
  RETURN_REASONS,
  type ReturnRefusal,
} from "@/db/queries/returns";
import { getSession } from "@/lib/session";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const returnSchema = z.object({
  reason: z.enum(
    RETURN_REASONS.map((r) => r.value) as [string, ...string[]],
    { message: "Choose what went wrong" },
  ),
  detail: z
    .string()
    .trim()
    .min(10, "Tell us a little more — a sentence is enough")
    .max(1000),
});

const REFUSALS: Record<ReturnRefusal, { status: number; message: string }> = {
  not_found: { status: 404, message: "We could not find that order." },
  not_yours: { status: 404, message: "We could not find that order." },
  not_delivered: {
    status: 409,
    message:
      "This order has not been marked delivered yet, so there is nothing to return. If it has arrived, contact us and we will sort it out.",
  },
  window_closed: {
    status: 409,
    message: "The window for this kind of return has closed.",
  },
  already_requested: {
    status: 409,
    message:
      "There is already a return open on this order. Reply to our email about it rather than opening a second one.",
  },
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) {
    return NextResponse.json(
      { error: "We could not find that order.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // Same rule as cancellation: reading an order needs only the link, but
  // acting on one needs a session whose email matches it.
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      {
        error: "Please verify the order is yours before requesting a return.",
        code: "VERIFICATION_REQUIRED",
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

  const parsed = returnSchema.safeParse(payload);
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
    const result = await createReturnRequest({
      orderId: id,
      verifiedEmail: session.email,
      reason: parsed.data.reason as Parameters<
        typeof createReturnRequest
      >[0]["reason"],
      detail: parsed.data.detail,
    });

    if (!result.ok) {
      const refusal = REFUSALS[result.reason];
      const message =
        result.reason === "window_closed" && result.hoursAllowed
          ? result.hoursAllowed <= 48
            ? `Damage, wrong items and missing items have to be reported within ${result.hoursAllowed} hours of delivery. Contact us anyway — tell us what happened and we will do what we can.`
            : `Change-of-mind returns close ${result.hoursAllowed / 24} days after delivery. Contact us anyway and we will see what is possible.`
          : refusal.message;

      return NextResponse.json(
        { error: message, code: result.reason.toUpperCase() },
        { status: refusal.status },
      );
    }

    return NextResponse.json(
      { ok: true, id: result.id },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[orders/return] database unavailable:", error);
      return NextResponse.json(
        {
          error:
            "We could not reach our order system just now. Nothing has changed — please try again in a moment.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    console.error("[orders/return] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
