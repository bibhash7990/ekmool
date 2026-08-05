import { NextResponse, type NextRequest } from "next/server";
import { revalidateCatalog, revalidateReviews } from "@/lib/revalidate";
import { revalidateSecret } from "@/lib/env";
import { timingSafeEquals } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand invalidation of everything cached from the database.
 * Protected by x-revalidate-secret.
 *
 * Both tags, not just the catalogue. This endpoint is the manual escape
 * hatch — the thing you reach for after editing rows by hand, or after a
 * deploy that changed how a page renders — and an escape hatch that
 * silently leaves half the cache in place is worse than none, because it
 * looks like it worked.
 *
 * The moderation path is narrower on purpose: publishing a review calls
 * revalidateReviews() alone, so it does not send every product page back
 * to the database for catalogue data that has not changed.
 */
export async function POST(request: NextRequest) {
  const provided = request.headers.get("x-revalidate-secret") ?? "";

  if (!revalidateSecret || !timingSafeEquals(provided, revalidateSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateCatalog();
  revalidateReviews();

  return NextResponse.json({
    revalidated: true,
    tags: ["products", "reviews"],
    at: new Date().toISOString(),
  });
}
