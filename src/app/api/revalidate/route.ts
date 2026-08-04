import { NextResponse, type NextRequest } from "next/server";
import { revalidateCatalog } from "@/lib/revalidate";
import { revalidateSecret } from "@/lib/env";
import { timingSafeEquals } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** On-demand catalogue invalidation. Protected by x-revalidate-secret. */
export async function POST(request: NextRequest) {
  const provided = request.headers.get("x-revalidate-secret") ?? "";

  if (!revalidateSecret || !timingSafeEquals(provided, revalidateSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateCatalog();

  return NextResponse.json({
    revalidated: true,
    at: new Date().toISOString(),
  });
}
