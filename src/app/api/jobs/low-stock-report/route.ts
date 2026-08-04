import { NextResponse, type NextRequest } from "next/server";
import { authorizeJob } from "@/lib/jobs";
import { listStock } from "@/db/queries/admin";
import { buildLowStockEmail } from "@/emails/low-stock-report";
import { sendAndLog } from "@/lib/mail";
import { adminEmail, appUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily at 08:00 IST: email the admin anything at or below threshold. */
export async function POST(request: NextRequest) {
  const unauthorized = authorizeJob(request);
  if (unauthorized) return unauthorized;

  try {
    const stock = await listStock();
    const low = stock.filter((row) => row.isLow);

    if (low.length === 0) {
      return NextResponse.json({
        job: "low-stock-report",
        lowCount: 0,
        emailed: false,
        note: "Nothing below threshold — no email sent.",
      });
    }

    if (!adminEmail) {
      console.warn("[jobs] ADMIN_EMAIL is not set — low stock report skipped");
      return NextResponse.json({
        job: "low-stock-report",
        lowCount: low.length,
        emailed: false,
        note: "ADMIN_EMAIL is not configured.",
      });
    }

    const result = await sendAndLog(
      "low_stock_report",
      buildLowStockEmail(low, adminEmail, appUrl),
      null,
    );

    return NextResponse.json({
      job: "low-stock-report",
      lowCount: low.length,
      outOfStock: low.filter((row) => row.stockQty === 0).length,
      emailed: result.status,
    });
  } catch (error) {
    console.error("[jobs] low-stock-report failed:", error);
    return NextResponse.json(
      { error: "Job failed", code: "JOB_FAILED" },
      { status: 500 },
    );
  }
}

export const GET = POST;
