import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { toCsv, csvHeaders } from "@/lib/csv";
import { paiseToRupees } from "@/lib/money";
import {
  exportOrders,
  getTopProducts,
  getLowStock,
  getRevenueByDay,
  listCustomersForAdmin,
} from "@/db/queries/reports";
import { listReturns, reasonLabel } from "@/db/queries/returns";
import { listAuditLog } from "@/db/queries/audit";

export const dynamic = "force-dynamic";

/**
 * CSV exports.
 *
 * Every money column is **rupees**, not paise. The database stores paise
 * because integers do not drift; a spreadsheet the owner hands to their
 * accountant should not require them to divide by a hundred, and a column
 * headed "total" containing 50220 is a number somebody will eventually
 * treat as fifty thousand rupees.
 *
 * The quoting and the formula-injection guard live in src/lib/csv.ts. That
 * matters here specifically, because these rows carry customer names,
 * addresses and free text the customer typed — the exact path by which
 * `=HYPERLINK(...)` gets from a checkout form into a spreadsheet that
 * executes it.
 */

const REPORTS = [
  "orders",
  "customers",
  "products",
  "stock",
  "revenue",
  "returns",
  "audit",
] as const;

type Report = (typeof REPORTS)[number];

function isReport(value: string): value is Report {
  return (REPORTS as readonly string[]).includes(value);
}

/** ISO-ish and sortable, in IST, which is the shop's clock. */
const STAMP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function stamp(value: Date | null): string {
  return value ? STAMP.format(value).replace(", ", " ") : "";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  if (!(await isAdminRequest())) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { report } = await params;
  if (!isReport(report)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const days = Math.min(
    Math.max(Number(url.searchParams.get("days")) || 90, 1),
    730,
  );

  try {
    const { headers, rows, filename } = await build(report, days);
    return new NextResponse(toCsv(headers, rows), {
      headers: csvHeaders(filename),
    });
  } catch (error) {
    console.error(`[admin] export ${report} failed:`, error);
    return new NextResponse("Could not build that export", { status: 500 });
  }
}

async function build(
  report: Report,
  days: number,
): Promise<{
  headers: string[];
  rows: unknown[][];
  filename: string;
}> {
  switch (report) {
    case "orders": {
      const orders = await exportOrders(days);
      return {
        filename: `ekmool-orders-last-${days}-days`,
        headers: [
          "Order id",
          "Placed",
          "Status",
          "Payment",
          "Payment status",
          "Invoice",
          "Customer",
          "Email",
          "Phone",
          "City",
          "State",
          "Pincode",
          "Items",
          "Coupon",
          "Subtotal ₹",
          "Discount ₹",
          "Shipping ₹",
          "GST ₹",
          "Total ₹",
        ],
        rows: orders.map((order) => [
          order.id,
          stamp(order.created_at),
          order.status,
          order.payment_method,
          order.payment_status,
          order.invoice_number ?? "",
          order.customer_name,
          order.customer_email,
          order.customer_phone,
          order.address_city,
          order.address_state,
          order.address_pincode,
          order.items ?? "",
          order.coupon_code ?? "",
          paiseToRupees(Number(order.subtotal_paise)),
          paiseToRupees(Number(order.discount_paise)),
          paiseToRupees(Number(order.shipping_paise)),
          paiseToRupees(Number(order.tax_paise)),
          paiseToRupees(Number(order.total_paise)),
        ]),
      };
    }

    case "customers": {
      const customers = await listCustomersForAdmin(1000);
      return {
        filename: "ekmool-customers",
        headers: [
          "Name",
          "Email",
          "Phone",
          "Orders",
          "Spent ₹",
          "First seen",
          "Last order",
          "Marketing consent",
        ],
        rows: customers.map((customer) => [
          customer.name,
          customer.email,
          customer.phone,
          customer.orders,
          paiseToRupees(customer.spentPaise),
          stamp(customer.createdAt),
          stamp(customer.lastOrderAt),
          customer.marketingOptIn,
        ]),
      };
    }

    case "products": {
      const products = await getTopProducts(days, 100);
      return {
        filename: `ekmool-products-last-${days}-days`,
        headers: ["Product", "Slug", "Units", "Orders", "Revenue ₹"],
        rows: products.map((product) => [
          product.productName,
          product.productSlug,
          product.units,
          product.orders,
          paiseToRupees(product.revenuePaise),
        ]),
      };
    }

    case "stock": {
      const low = await getLowStock();
      return {
        filename: "ekmool-low-stock",
        headers: [
          "Product",
          "Pack",
          "SKU",
          "In stock",
          "Warn below",
          "Sold in 30 days",
          "Customers waiting",
        ],
        rows: low.map((row) => [
          row.productName,
          row.packSizeLabel,
          row.sku,
          row.stockQty,
          row.lowStockThreshold,
          row.soldLast30,
          row.waitingCustomers,
        ]),
      };
    }

    case "revenue": {
      const daysRows = await getRevenueByDay(days);
      return {
        filename: `ekmool-revenue-last-${days}-days`,
        headers: ["Day (IST)", "Orders", "Gross ₹"],
        rows: daysRows.map((day) => [
          day.day,
          day.orders,
          paiseToRupees(day.grossPaise),
        ]),
      };
    }

    case "returns": {
      const returns = await listReturns();
      return {
        filename: "ekmool-returns",
        headers: [
          "Order",
          "Raised",
          "Reason",
          "What they said",
          "Status",
          "Resolution",
          "Order value ₹",
          "Customer",
          "Email",
        ],
        rows: returns.map((entry) => [
          entry.orderRef,
          stamp(entry.createdAt),
          reasonLabel(entry.reason),
          entry.detail,
          entry.status,
          entry.resolution ?? "",
          paiseToRupees(entry.totalPaise),
          entry.customerName,
          entry.customerEmail,
        ]),
      };
    }

    case "audit": {
      const entries = await listAuditLog(500);
      return {
        filename: "ekmool-admin-activity",
        headers: ["When", "Who", "Action", "Entity", "Id", "What changed"],
        rows: entries.map((entry) => [
          stamp(entry.createdAt),
          entry.actor,
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.summary,
        ]),
      };
    }
  }
}
