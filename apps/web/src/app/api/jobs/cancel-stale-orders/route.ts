import { NextResponse, type NextRequest } from "next/server";
import { authorizeJob } from "@/lib/jobs";
import { cancelStaleOrders } from "@/db/queries/jobs";
import { revalidateCatalog } from "@/lib/revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily: cancel orders left unpaid beyond the window and return their
 * stock to the shelf. Runs once a day, so purging the catalogue here is
 * cheap and worth it — restored stock should become visible promptly.
 */
export async function POST(request: NextRequest) {
  const unauthorized = authorizeJob(request);
  if (unauthorized) return unauthorized;

  try {
    const cancelled = await cancelStaleOrders(48);

    if (cancelled.length > 0) {
      revalidateCatalog();
    }

    return NextResponse.json({
      job: "cancel-stale-orders",
      cancelled: cancelled.length,
      unitsRestored: cancelled.reduce(
        (sum, entry) =>
          sum + entry.restored.reduce((n, item) => n + item.qty, 0),
        0,
      ),
      orders: cancelled.map((entry) => entry.orderId),
    });
  } catch (error) {
    console.error("[jobs] cancel-stale-orders failed:", error);
    return NextResponse.json(
      { error: "Job failed", code: "JOB_FAILED" },
      { status: 500 },
    );
  }
}

export const GET = POST;
