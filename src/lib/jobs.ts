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
  const provided = request.headers.get("x-cron-secret") ?? "";

  if (!cronSecret) {
    console.error("[jobs] CRON_SECRET is not set — refusing to run");
    return NextResponse.json(
      { error: "Jobs are not configured", code: "CRON_SECRET_UNSET" },
      { status: 503 },
    );
  }

  if (!timingSafeEquals(provided, cronSecret)) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  return null;
}
