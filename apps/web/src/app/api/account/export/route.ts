import { NextResponse } from "next/server";
import { getCustomerEmail } from "@/lib/account";
import { exportCustomerData } from "@/db/queries/privacy";
import { DbUnconfiguredError } from "@/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DPDP s.11 — the right to know what is held about you.
 *
 * Downloads as JSON rather than a rendered page, because the point of an
 * access request is to hand over the data itself in a form the person can
 * keep, re-read and take elsewhere. A screen they have to screenshot is not
 * that.
 *
 * Scoped to the session email and nothing else. There is no parameter to
 * tamper with, which is the only reliable way to make sure one person
 * cannot request another's file.
 */
export async function GET(request: Request) {
  const email = await getCustomerEmail(request.headers);
  if (!email) {
    return NextResponse.json(
      { error: "Sign in at /track first.", code: "NOT_SIGNED_IN" },
      { status: 401 },
    );
  }

  try {
    const data = await exportCustomerData(email);
    const stamp = data.exportedAt.slice(0, 10);

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="ekmool-data-${stamp}.json"`,
        // Never let this sit in a shared cache. It is one person's file.
        "cache-control": "no-store, private",
      },
    });
  } catch (error) {
    if (
      error instanceof DbUnconfiguredError ||
      (error instanceof Error && "code" in error)
    ) {
      console.error("[account/export] database unavailable:", error);
      return NextResponse.json(
        {
          error: "We cannot prepare your data just now. Please try again shortly.",
          code: "DB_UNAVAILABLE",
        },
        { status: 503 },
      );
    }

    console.error("[account/export] unexpected failure:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
