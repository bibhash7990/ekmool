import { NextResponse, type NextRequest } from "next/server";
import { getOrderById } from "@/db/queries/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Order lookup for the confirmation page.
 *
 * The ULID id is the only credential — it is unguessable, and the
 * response deliberately omits the full address and phone number so a
 * leaked link cannot expose more than the buyer already knows.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) {
    return NextResponse.json(
      { error: "Not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  try {
    const order = await getOrderById(id);
    if (!order) {
      return NextResponse.json(
        { error: "Not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        id: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        subtotalPaise: order.subtotalPaise,
        shippingPaise: order.shippingPaise,
        totalPaise: order.totalPaise,
        trackingId: order.trackingId,
        createdAt: order.createdAt,
        customerFirstName: order.customerName.split(" ")[0],
        deliverTo: {
          city: order.address.city,
          state: order.address.state,
          pincode: order.address.pincode,
        },
        items: order.items,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[orders] lookup failed:", error);
    return NextResponse.json(
      { error: "Order lookup is unavailable", code: "DB_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
