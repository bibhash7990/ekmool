import { NextResponse, type NextRequest } from "next/server";
import { cancelOrderByCustomer, type CancelRefusal } from "@/db/queries/orders";
import { resolveSession } from "@/lib/session";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Self-service cancellation.
 *
 * Viewing an order needs only its ULID — that is the credential in the
 * emailed link, and it is unguessable. Cancelling is destructive and
 * restores stock, so it needs more: a session whose verified email matches
 * the order. Anyone with the link but no session is sent to /track, where
 * proving it is theirs takes ten seconds.
 */

const REFUSALS: Record<CancelRefusal, { status: number; message: string }> = {
  // Deliberately the same reply for "no such order" and "not your order":
  // knowing which would turn this into an order-existence oracle.
  not_found: { status: 404, message: "We could not find that order." },
  not_yours: { status: 404, message: "We could not find that order." },
  already_cancelled: {
    status: 409,
    message: "That order is already cancelled.",
  },
  too_late: {
    status: 409,
    message:
      "This order has already been packed, so it can no longer be cancelled here. Contact us and we will sort it out.",
  },
  prepaid: {
    status: 409,
    message:
      "This order has been paid online, so cancelling it means issuing a refund. Contact us and we will cancel and refund it for you.",
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

  const session = await resolveSession(request.headers);
  if (!session) {
    return NextResponse.json(
      {
        error: "Please verify the order is yours before cancelling it.",
        code: "VERIFICATION_REQUIRED",
      },
      { status: 401 },
    );
  }

  try {
    const result = await cancelOrderByCustomer(id, session.email);

    if (!result.ok) {
      const refusal = REFUSALS[result.reason];
      return NextResponse.json(
        { error: refusal.message, code: result.reason.toUpperCase() },
        { status: refusal.status },
      );
    }

    return NextResponse.json(
      { ok: true, orderId: id, restored: result.restored },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[orders/cancel] database unavailable:", error);
      return NextResponse.json(
        {
          error:
            "We could not reach our order system just now. Nothing has changed — please try again in a moment.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    console.error("[orders/cancel] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
