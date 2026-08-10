import { NextResponse, type NextRequest } from "next/server";
import {
  revalidateCatalog,
  revalidateContent,
  revalidateReviews,
} from "@/lib/revalidate";
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
 *
 * `?fanout=1&kind=…` is the other caller: src/lib/purge-subscriber.ts,
 * applying a purge that another instance announced over Redis. It narrows
 * to the one tag that actually changed and, critically, suppresses the
 * re-announcement — without which two containers would forward the same
 * purge to each other indefinitely.
 */
export async function POST(request: NextRequest) {
  const provided = request.headers.get("x-revalidate-secret") ?? "";

  if (!revalidateSecret || !timingSafeEquals(provided, revalidateSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fanout = request.nextUrl.searchParams.get("fanout") === "1";
  const kind = request.nextUrl.searchParams.get("kind");
  const options = fanout ? { broadcast: false } : undefined;

  const tags: string[] = [];
  if (!fanout || kind === "catalog") {
    revalidateCatalog(options);
    tags.push("products");
  }
  if (!fanout || kind === "reviews") {
    revalidateReviews(options);
    tags.push("reviews");
  }
  if (!fanout || kind === "content") {
    revalidateContent(options);
    tags.push("site-content");
  }

  return NextResponse.json({
    revalidated: true,
    tags,
    fanout,
    at: new Date().toISOString(),
  });
}
