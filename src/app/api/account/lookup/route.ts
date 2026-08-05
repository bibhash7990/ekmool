import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findOrdersByRef } from "@/db/queries/orders";
import { timingSafeEquals } from "@/lib/crypto";
import { attachSession } from "@/lib/session";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Order lookup — the only way into an account, and there is no other kind
 * of account. The customer quotes the eight-character reference printed on
 * their confirmation page and in every email, plus the address they checked
 * out with. Both correct, and we hand back a session cookie carrying that
 * now-verified email.
 *
 * Enumeration is the attack worth caring about, so three things hold:
 *
 *  1. 5 requests per minute per IP (src/lib/rate-limit.ts).
 *  2. One response for every failure — same status, same words — so a
 *     prober cannot learn that a reference exists by supplying the wrong
 *     email for it.
 *  3. Constant-time comparison, including against a decoy when no order
 *     matched at all, so the reply does not take measurably longer when it
 *     had a real address to compare.
 *
 * The database lookup itself still takes slightly different time on a hit
 * and a miss. That is a far weaker signal than the rate limit permits any
 * use of, and closing it entirely would mean querying for orders that do
 * not exist.
 */

const lookupSchema = z.object({
  // Accept the eight-character reference as printed, or a full ULID pasted
  // out of a link. Spaces and a leading # are what people actually type.
  reference: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s#-]/g, "").toUpperCase())
    .refine(
      (value) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(value) || /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value),
      { message: "Enter the 8-character order reference from your confirmation" },
    ),
  email: z.email("Enter the email address you ordered with").max(200),
});

const FAILURE = {
  error:
    "We could not match that order reference and email address. Check both against your confirmation email — the reference is the 8 characters after the #.",
  code: "LOOKUP_FAILED",
} as const;

/** Burns a comparison against a decoy so a miss costs what a hit costs. */
const DECOY_EMAIL = "no-such-customer@ekmool.invalid";

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

  const parsed = lookupSchema.safeParse(payload);
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

  const { reference, email } = parsed.data;
  const submitted = email.trim().toLowerCase();

  try {
    const candidates =
      reference.length === 26
        ? (await findOrdersByRef(reference.slice(-8))).filter((c) => c.id === reference)
        : await findOrdersByRef(reference);

    let matchedId: string | null = null;
    for (const candidate of candidates) {
      if (timingSafeEquals(candidate.email.toLowerCase(), submitted)) {
        matchedId = candidate.id;
      }
    }
    if (candidates.length === 0) {
      timingSafeEquals(DECOY_EMAIL, submitted);
    }

    if (!matchedId) {
      return NextResponse.json(FAILURE, { status: 404 });
    }

    const response = NextResponse.json(
      { orderId: matchedId, email: submitted },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
    attachSession(response, submitted);
    return response;
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[account/lookup] database unavailable:", error);
      return NextResponse.json(
        {
          error: "Order lookup is unavailable just now. Please try again shortly.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    console.error("[account/lookup] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
