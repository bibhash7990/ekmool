import { NextResponse, type NextRequest } from "next/server";
import { checkPincode } from "@/lib/serviceability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PIN code to circle and delivery estimate.
 *
 * A route rather than a client-side lookup, for one reason: the prefix
 * tables in lib/serviceability.ts are the kind of data that only grows —
 * real courier serviceability, pincode-level ETAs, cash-on-delivery
 * exclusions — and none of that should ever become bytes every visitor
 * downloads to find out about one PIN code they already know.
 *
 * It touches no database, so it answers during an outage, and the response
 * is pure: 560001 means the same thing tomorrow. Hence the long cache
 * header — a CDN in front of this serves the second person to check a PIN
 * code without reaching the origin at all.
 */

const CACHE_A_DAY = "public, max-age=86400, stale-while-revalidate=604800";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("pincode") ?? "";

  // Cheap guard before the real check: an over-long parameter is not a
  // typo, and there is no reason to normalise a kilobyte of it.
  if (raw.length > 12) {
    return NextResponse.json(
      {
        code: "INVALID_FORMAT",
        message: "An Indian PIN code is six digits, with no letters or spaces.",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const result = checkPincode(raw);

  return NextResponse.json(result, {
    // A malformed PIN code is a bad request; a well-formed one we cannot
    // serve by courier is still a successful lookup with an honest answer,
    // so only the format failures carry a 4xx.
    status: result.code === "INVALID_FORMAT" ? 400 : 200,
    headers: {
      "cache-control": result.code === "OK" ? CACHE_A_DAY : "no-store",
    },
  });
}
