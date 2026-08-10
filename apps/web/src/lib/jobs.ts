import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cronSecret } from "@/lib/env";
import { timingSafeEquals } from "@/lib/crypto";

/**
 * Shared guard for /api/jobs/*. A job route is a privileged endpoint that
 * mutates orders and sends mail, so it must never be reachable without
 * the shared secret — and an unset CRON_SECRET must fail closed rather
 * than open.
 */
export function authorizeJob(request: NextRequest): NextResponse | null {
  if (!cronSecret) {
    console.error("[jobs] CRON_SECRET is not set — refusing to run");
    return NextResponse.json(
      { error: "Jobs are not configured", code: "CRON_SECRET_UNSET" },
      { status: 503 },
    );
  }

  // Two callers, two shapes, one secret.
  //
  // The compose scheduler sends x-cron-secret, which it controls. Vercel
  // Cron cannot send a custom header at all — it issues a plain GET and
  // proves itself with `Authorization: Bearer $CRON_SECRET`, reading the
  // project's own env var. Accepting only the first would have meant every
  // scheduled job on Vercel returning 401 with nothing in the UI to say
  // why: the invocation succeeds, the work silently never happens.
  //
  // Both are compared against the same secret, and both use the
  // constant-time comparison — a Bearer token is not a lesser credential
  // for being in a different header.
  const header = request.headers.get("x-cron-secret") ?? "";
  const bearer = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );

  if (
    !timingSafeEquals(header, cronSecret) &&
    !timingSafeEquals(bearer, cronSecret)
  ) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  return null;
}
