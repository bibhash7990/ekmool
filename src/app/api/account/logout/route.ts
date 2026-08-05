import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST only. A GET would let any page on the internet sign a customer out
 * with an <img> tag — harmless but rude, and trivial to prevent.
 */
export async function POST() {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
  clearSession(response);
  return response;
}
