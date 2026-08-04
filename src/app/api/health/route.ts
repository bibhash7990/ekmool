import { NextResponse } from "next/server";
import { pingDb } from "@/db/pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startedAt = Date.now();

/**
 * Liveness + dependency probe. `ok` reflects the app process, not the
 * database: browsing is served from static/ISR output, so the site is
 * healthy even while `db` is "down".
 */
export async function GET() {
  const dbUp = await pingDb();
  return NextResponse.json(
    {
      ok: true,
      db: dbUp ? "up" : "down",
      uptime: Math.round((Date.now() - startedAt) / 1000),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
