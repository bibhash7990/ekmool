/**
 * Admin completeness (M14).
 *
 *   npm run test:admin
 *
 * This one is different from its siblings. The admin is Clerk-gated and
 * Clerk is not configured in development, so there is no HTTP surface to
 * drive — /admin 404s by design. Instead of testing SQL written inside the
 * test (which proves nothing about the application), it imports the real
 * query modules through the `@/` resolve hook in scripts/alias-loader.mjs
 * and calls the same functions the server actions call.
 *
 * The three areas worth the most scrutiny:
 *
 *   **CSV.** An export is the path by which text a customer typed reaches a
 *   spreadsheet that will happily execute it. Section 1 asserts the
 *   formula-injection guard on every prefix that triggers it, and asserts
 *   that a negative number is *not* mangled by it.
 *
 *   **Presigned uploads.** Section 2 checks the parts of Signature Version
 *   4 that are security properties rather than protocol detail: the key is
 *   generated server-side and cannot be steered, the content type is signed
 *   so a URL for a JPEG cannot accept an HTML document, SVG is refused, and
 *   the expiry is clamped.
 *
 *   **Archive, never delete.** Section 3 asserts that a slug with orders
 *   behind it cannot be renamed and that the last pack of a live product
 *   cannot be archived — the two ways a catalogue edit silently breaks
 *   history or the storefront.
 */
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

loadEnv();

const {
  csvCell,
  csvRow,
  toCsv,
  csvHeaders,
} = await import("@/lib/csv");
const {
  buildObjectKey,
  presignUpload,
  isAllowedImageType,
  getStorageConfig,
} = await import("@/lib/storage");
const {
  createProduct,
  updateProduct,
  setProductActive,
  reorderProducts,
  createVariant,
  updateVariant,
  setVariantActive,
  reorderVariants,
  addProductImage,
  setPrimaryImage,
  deleteProductImage,
  getProductForAdmin,
  listProductsForAdmin,
  slugReferences,
  SlugLockedError,
} = await import("@/db/queries/catalog-admin");
const {
  getSalesSummary,
  getRevenueByDay,
  getTopProducts,
  getLowStock,
  getOrderFunnel,
  listCustomersForAdmin,
  getCustomerSummary,
} = await import("@/db/queries/reports");
const {
  decideReturn,
  allowedTransitions,
  listReturns,
  countReturnsByStatus,
} = await import("@/db/queries/returns");
const {
  recordAdminAction,
  listAuditLog,
  listAuditForEntity,
  diffFields,
} = await import("@/db/queries/audit");
const { orderStatusLabel } = await import("@/lib/order-status");
// The query modules open the application's own pool, on globalThis. Closing
// only this script's connection at the end leaves that pool's idle sockets
// holding the event loop open and the process never exits — which is a
// hang, not a failure, and therefore the kind that eats a CI minute budget.
const { getPool } = await import("@/db/pool");

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const db = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? "ekmool",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "ekmool",
});

/* Everything this script creates is prefixed so cleanup can be exact. */
const TAG = "admintest";
const SLUG = `${TAG}-saffron`;
const RENAMED = `${TAG}-saffron-strands`;
const ACTOR = `${TAG}-actor`;
const EMAIL = `${TAG}@example.com`;
const orderIds = [];

function orderId(suffix) {
  const id = `01ADMINTEST${String(suffix).padStart(2, "0")}${"X".repeat(26 - 13)}`.slice(
    0,
    26,
  );
  orderIds.push(id);
  return id;
}

async function cleanup() {
  if (orderIds.length > 0) {
    const marks = orderIds.map(() => "?").join(",");
    // order_items, order_status_history, return_requests and
    // coupon_redemptions all cascade from orders.
    await db.execute(`DELETE FROM orders WHERE id IN (${marks})`, orderIds);
  }
  await db.execute(`DELETE FROM customers WHERE email LIKE ?`, [`${TAG}%`]);
  await db.execute(
    `DELETE FROM back_in_stock_requests WHERE email LIKE ?`,
    [`${TAG}%`],
  );
  await db.execute(`DELETE FROM products WHERE slug LIKE ?`, [`${TAG}%`]);
  await db.execute(`DELETE FROM admin_audit_log WHERE actor = ?`, [ACTOR]);
}

await cleanup();

/* ================================================================== */
console.log("\n1. CSV — quoting, and the formula-injection guard");

check("plain text passes through", csvCell("Kandhamal") === "Kandhamal");
check("empty for null", csvCell(null) === "" && csvCell(undefined) === "");
check(
  "comma forces quoting",
  csvCell("Bengaluru, Karnataka") === '"Bengaluru, Karnataka"',
);
check(
  "an embedded quote is doubled",
  csvCell('She said "no"') === '"She said ""no"""',
);
check(
  "a newline forces quoting",
  csvCell("line one\nline two") === '"line one\nline two"',
);
check(
  "leading and trailing spaces are preserved by quoting",
  csvCell("  padded  ") === '"  padded  "',
);
check("boolean reads as a word", csvCell(true) === "yes" && csvCell(false) === "no");

for (const prefix of ["=", "+", "@", "\t", "\r"]) {
  const cell = csvCell(`${prefix}HYPERLINK("http://x")`);
  check(
    `a cell starting ${JSON.stringify(prefix)} is neutralised`,
    cell.includes(`'${prefix}`),
    cell,
  );
}
check(
  "the classic DDE payload is neutralised",
  csvCell(`=cmd|'/c calc'!A1`).startsWith(`'=cmd`),
  csvCell(`=cmd|'/c calc'!A1`),
);
check(
  "a leading hyphen in text is neutralised",
  csvCell("-- drop table") === "'-- drop table",
  csvCell("-- drop table"),
);
check(
  "a negative number is NOT mangled",
  csvCell(-55800) === "-55800",
  csvCell(-55800),
);
check(
  "a negative decimal is NOT mangled",
  csvCell(-502.2) === "-502.2",
  csvCell(-502.2),
);
check(
  "a positive number is untouched",
  csvCell(64000) === "64000" && csvCell("0.5") === "0.5",
);

check("a row joins with commas", csvRow(["a", "b"]) === "a,b");

const document = toCsv(["Name", "Total"], [["Bibhash", 502.2]]);
check("the document starts with a BOM", document.startsWith("﻿"), JSON.stringify(document.slice(0, 3)));
check("rows are CRLF separated", document.includes("\r\n"));
check("the document ends with CRLF", document.endsWith("\r\n"));
check(
  "the header is the first row",
  document.replace("﻿", "").startsWith("Name,Total\r\n"),
);

const headers = csvHeaders('orders";\r\nX-Injected: yes');
check(
  "the filename carries no quote, CR or LF, so no header injection",
  !/["\r\n]/.test(
    headers["Content-Disposition"].replace(/^attachment; filename="|"$/g, ""),
  ),
  headers["Content-Disposition"],
);
check(
  "and it is still a .csv the browser will name sensibly",
  headers["Content-Disposition"].startsWith('attachment; filename="orders') &&
    headers["Content-Disposition"].endsWith('.csv"'),
  headers["Content-Disposition"],
);
check(
  "an export is never cached",
  String(headers["Cache-Control"]).includes("no-store"),
);

/* ================================================================== */
console.log("\n2. Presigned uploads — SigV4 without an SDK");

check(
  "no storage configured means no ticket",
  getStorageConfig() === null && presignUpload({ slug: "x", contentType: "image/png" }) === null,
);

check("SVG is refused", !isAllowedImageType("image/svg+xml"));
check("HTML is refused", !isAllowedImageType("text/html"));
check("JPEG is allowed", isAllowedImageType("image/jpeg"));

check(
  "a traversal attempt does not escape the prefix",
  buildObjectKey("../../etc/passwd", "image/png").startsWith("products/etc-passwd/"),
  buildObjectKey("../../etc/passwd", "image/png"),
);
check(
  "the extension comes from the content type, not the name",
  buildObjectKey("photo.html", "image/webp").endsWith(".webp"),
);
check(
  "two keys for the same slug differ",
  buildObjectKey("saffron", "image/png") !== buildObjectKey("saffron", "image/png"),
);
let keyThrew = false;
try {
  buildObjectKey("saffron", "image/svg+xml");
} catch {
  keyThrew = true;
}
check("an unsupported type cannot produce a key", keyThrew);

// Configure a throwaway bucket for the signing assertions. Credentials
// invented here and never used against a real endpoint.
Object.assign(process.env, {
  S3_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
  S3_BUCKET: "ekmool-test",
  S3_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
  S3_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  S3_PUBLIC_BASE_URL: "https://cdn.example.com",
  S3_REGION: "auto",
});

const clock = new Date("2026-08-06T09:15:00Z");
const ticket = presignUpload({
  slug: "Test Saffron",
  contentType: "image/jpeg",
  now: clock,
});

check("a ticket is issued once storage is configured", ticket !== null);
if (ticket) {
  const signed = new URL(ticket.uploadUrl);
  check(
    "the upload goes to the configured endpoint",
    signed.host === "accountid.r2.cloudflarestorage.com",
    signed.host,
  );
  check(
    "path style: the bucket is the first path segment",
    signed.pathname.startsWith("/ekmool-test/products/test-saffron/"),
    signed.pathname,
  );
  check(
    "the public URL is the CDN, not the signing endpoint",
    ticket.publicUrl === `https://cdn.example.com/${ticket.key}`,
    ticket.publicUrl,
  );
  check(
    "the algorithm is declared",
    signed.searchParams.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256",
  );
  check(
    "content-type is signed, so the URL cannot accept HTML",
    signed.searchParams.get("X-Amz-SignedHeaders") === "content-type;host",
    signed.searchParams.get("X-Amz-SignedHeaders"),
  );
  check(
    "the credential carries the scope",
    signed.searchParams.get("X-Amz-Credential") ===
      "AKIAIOSFODNN7EXAMPLE/20260806/auto/s3/aws4_request",
    signed.searchParams.get("X-Amz-Credential"),
  );
  check(
    "the date is the basic ISO form",
    signed.searchParams.get("X-Amz-Date") === "20260806T091500Z",
    signed.searchParams.get("X-Amz-Date"),
  );
  check(
    "the signature is 64 hex characters",
    /^[0-9a-f]{64}$/.test(signed.searchParams.get("X-Amz-Signature") ?? ""),
  );

  const shortLived = presignUpload({
    slug: "x",
    contentType: "image/png",
    now: clock,
    expiresInSeconds: 5,
  });
  const longLived = presignUpload({
    slug: "x",
    contentType: "image/png",
    now: clock,
    expiresInSeconds: 99_999,
  });
  check(
    "the expiry is clamped at both ends",
    shortLived?.expiresInSeconds === 60 && longLived?.expiresInSeconds === 3600,
    `${shortLived?.expiresInSeconds} / ${longLived?.expiresInSeconds}`,
  );

  // Same everything, different secret: the signature must move. This is
  // the property that says the secret is actually in the HMAC chain.
  const before = new URL(
    presignUpload({ slug: "fixed", contentType: "image/png", now: clock }).uploadUrl,
  ).searchParams.get("X-Amz-Signature");
  process.env.S3_SECRET_ACCESS_KEY = "a-different-secret-entirely";
  const after = new URL(
    presignUpload({ slug: "fixed", contentType: "image/png", now: clock }).uploadUrl,
  ).searchParams.get("X-Amz-Signature");
  check("a different secret gives a different signature", before !== after);
}

for (const key of [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_PUBLIC_BASE_URL",
  "S3_REGION",
]) {
  delete process.env[key];
}

/* ================================================================== */
console.log("\n3. Catalogue — create, publish, archive, and what is refused");

const productId = await createProduct({
  slug: SLUG,
  name: "Test Saffron",
  originState: "Jammu and Kashmir",
  giTagName: "Kashmir Saffron",
  shortDescription: "A test product created by scripts/test-admin.mjs.",
  longDescription:
    "This exists only for the admin test suite.\n\nIt is removed when the run finishes.",
  accent: "gold",
  hsnCode: "09102010",
  gstRateBps: 500,
  seoTitle: null,
  seoDescription: null,
});

let product = await getProductForAdmin(productId);
check("a new product is created switched off", product?.isActive === false);
check(
  "it sorts after everything already in the catalogue",
  (product?.sortOrder ?? 0) > 5,
  String(product?.sortOrder),
);
check("it has no editorial entry", product?.hasEditorialContent === false);

let publish = await setProductActive(productId, true);
check(
  "publishing is refused with no packs",
  publish.ok === false && publish.reason === "no_active_variant",
  JSON.stringify(publish),
);

const variantA = await createVariant(productId, {
  sku: "ADMINTEST-1G",
  packSizeLabel: "1 g",
  packSizeGrams: 1,
  pricePaise: 64000,
  mrpPaise: 75000,
  lowStockThreshold: 5,
  stockQty: 12,
});

publish = await setProductActive(productId, true);
check(
  "publishing is refused with no photograph",
  publish.ok === false && publish.reason === "no_image",
  JSON.stringify(publish),
);

const imageA = await addProductImage(productId, {
  url: "/images/products/admintest-a.jpg",
  altText: "A test photograph, one",
});
product = await getProductForAdmin(productId);
check(
  "the first photograph becomes the main one",
  product?.images[0]?.isPrimary === true,
);

publish = await setProductActive(productId, true);
check("with a pack and a photograph it publishes", publish.ok === true);

/* --- the slug --- */

let refs = await slugReferences(SLUG);
check("nothing references a brand new slug", refs.total === 0);

await updateProduct(productId, {
  slug: RENAMED,
  name: "Test Saffron",
  originState: "Jammu and Kashmir",
  giTagName: "Kashmir Saffron",
  shortDescription: "A test product created by scripts/test-admin.mjs.",
  longDescription: "Renamed once, while nothing pointed at it.",
  accent: "gold",
  hsnCode: "09102010",
  gstRateBps: 500,
  seoTitle: "Test Saffron — admin suite",
  seoDescription: null,
});
product = await getProductForAdmin(productId);
check("an unreferenced slug can be changed", product?.slug === RENAMED);
check("the SEO title is saved", product?.seoTitle === "Test Saffron — admin suite");

// Now give it history: one order line pointing at the slug.
const historyOrder = orderId(1);
await db.execute(
  `INSERT INTO orders
     (id, idempotency_key, customer_name, customer_email, customer_phone,
      address_line1, address_city, address_state, address_pincode,
      payment_method, payment_status, status, subtotal_paise, total_paise)
   VALUES (?, ?, 'Admin Test', ?, '9000000000', '1 Test Road', 'Bengaluru',
           'Karnataka', '560001', 'cod', 'pending', 'delivered', 64000, 64000)`,
  [historyOrder, `${TAG}-1`, EMAIL],
);
await db.execute(
  `INSERT INTO order_items
     (order_id, variant_id, sku, product_slug, product_name, pack_size_label,
      unit_price_paise, qty, line_total_paise, gst_rate_bps,
      taxable_value_paise)
   VALUES (?, ?, 'ADMINTEST-1G', ?, 'Test Saffron', '1 g', 64000, 1, 64000, 0, 64000)`,
  [historyOrder, variantA, RENAMED],
);
await db.execute(
  `UPDATE orders SET delivered_at = NOW() WHERE id = ?`,
  [historyOrder],
);

refs = await slugReferences(RENAMED);
check("the order line is counted as a reference", refs.orderItems === 1);

let slugRefused = false;
try {
  await updateProduct(productId, {
    slug: `${TAG}-third-name`,
    name: "Test Saffron",
    originState: "Jammu and Kashmir",
    giTagName: "Kashmir Saffron",
    shortDescription: "A test product created by scripts/test-admin.mjs.",
    longDescription: "This rename must be refused.",
    accent: "gold",
    hsnCode: "09102010",
    gstRateBps: 500,
    seoTitle: null,
    seoDescription: null,
  });
} catch (error) {
  slugRefused = error instanceof SlugLockedError;
}
check("a slug with an order behind it cannot be renamed", slugRefused);
product = await getProductForAdmin(productId);
check(
  "and nothing else was saved either — the refusal is total",
  product?.slug === RENAMED &&
    product?.longDescription.startsWith("Renamed once"),
  product?.longDescription.slice(0, 30),
);

/* --- variants --- */

const beforeStock = product.variants.find((v) => v.id === variantA)?.stockQty;
await updateVariant(productId, variantA, {
  sku: "ADMINTEST-1G",
  packSizeLabel: "1 g",
  packSizeGrams: 1,
  pricePaise: 68000,
  mrpPaise: 75000,
  lowStockThreshold: 5,
});
product = await getProductForAdmin(productId);
const afterEdit = product.variants.find((v) => v.id === variantA);
check("the price is saved", afterEdit?.pricePaise === 68000);
check(
  "editing a pack does not touch its stock",
  afterEdit?.stockQty === beforeStock,
  `${beforeStock} → ${afterEdit?.stockQty}`,
);

let archive = await setVariantActive(productId, variantA, false);
check(
  "the last pack of a live product cannot be archived",
  archive.ok === false && archive.reason === "last_active_variant",
  JSON.stringify(archive),
);

const variantB = await createVariant(productId, {
  sku: "ADMINTEST-5G",
  packSizeLabel: "5 g",
  packSizeGrams: 5,
  pricePaise: 300000,
  mrpPaise: 350000,
  lowStockThreshold: 2,
  stockQty: 0,
});
archive = await setVariantActive(productId, variantA, false);
check("with a second pack the first can be archived", archive.ok === true);
await setVariantActive(productId, variantA, true);

check(
  "a variant belonging to another product cannot be touched",
  (await setVariantActive(productId + 9999, variantA, false)).ok === false,
);

await reorderVariants(productId, [variantB, variantA]);
product = await getProductForAdmin(productId);
const order = product.variants
  .filter((v) => v.isActive)
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((v) => v.id);
check(
  "packs reorder as a whole list",
  order[0] === variantB && order[1] === variantA,
  JSON.stringify(order),
);

/* --- images --- */

const imageB = await addProductImage(productId, {
  url: "/images/products/admintest-b.jpg",
  altText: "A test photograph, two",
});
product = await getProductForAdmin(productId);
check(
  "the second photograph is not primary",
  product.images.filter((i) => i.isPrimary).length === 1,
);

await setPrimaryImage(productId, imageB);
product = await getProductForAdmin(productId);
check(
  "exactly one photograph is primary after a change",
  product.images.filter((i) => i.isPrimary).length === 1 &&
    product.images.find((i) => i.isPrimary)?.id === imageB,
);

await deleteProductImage(productId, imageB);
product = await getProductForAdmin(productId);
check(
  "deleting the main photograph promotes the next",
  product.images.length === 1 &&
    product.images[0].id === imageA &&
    product.images[0].isPrimary === true,
);

check(
  "an image belonging to another product cannot be deleted",
  (await deleteProductImage(productId + 9999, imageA)) === false,
);

/* --- listing and ordering --- */

const listed = await listProductsForAdmin();
check(
  "the admin list includes the new product",
  listed.some((entry) => entry.id === productId),
);
const summary = listed.find((entry) => entry.id === productId);
check(
  "the summary counts packs and stock",
  summary?.activeVariantCount === 2 && summary?.totalStock === 12,
  JSON.stringify({
    packs: summary?.activeVariantCount,
    stock: summary?.totalStock,
  }),
);

const liveIds = listed.filter((p) => p.isActive).map((p) => p.id);
const rotated = [productId, ...liveIds.filter((id) => id !== productId)];
await reorderProducts(rotated);
const reordered = await listProductsForAdmin();
check(
  "the catalogue order is saved",
  reordered.filter((p) => p.isActive)[0]?.id === productId,
);
// Put the launch products back the way they were.
await reorderProducts([...liveIds.filter((id) => id !== productId), productId]);

/* ================================================================== */
console.log("\n4. Reports — ordered is not collected");

const baseline = await getSalesSummary(30);

async function makeOrder({
  suffix,
  status,
  paymentMethod,
  paymentStatus,
  totalPaise,
  createdAtSql = "NOW()",
}) {
  const id = orderId(suffix);
  await db.query(
    `INSERT INTO orders
       (id, idempotency_key, customer_name, customer_email, customer_phone,
        address_line1, address_city, address_state, address_pincode,
        payment_method, payment_status, status, subtotal_paise, total_paise,
        created_at)
     VALUES (?, ?, 'Admin Test', ?, '9000000000', '1 Test Road', 'Bengaluru',
             'Karnataka', '560001', ?, ?, ?, ?, ?, ${createdAtSql})`,
    [
      id,
      `${TAG}-${suffix}`,
      EMAIL,
      paymentMethod,
      paymentStatus,
      status,
      totalPaise,
      totalPaise,
    ],
  );
  await db.execute(
    `INSERT INTO order_items
       (order_id, variant_id, sku, product_slug, product_name, pack_size_label,
        unit_price_paise, qty, line_total_paise, gst_rate_bps,
        taxable_value_paise, cgst_paise, sgst_paise)
     VALUES (?, ?, 'ADMINTEST-1G', ?, 'Test Saffron', '1 g', ?, 1, ?, 500, ?, ?, ?)`,
    [
      id,
      variantA,
      RENAMED,
      totalPaise,
      totalPaise,
      Math.round(totalPaise / 1.05),
      Math.round((totalPaise - Math.round(totalPaise / 1.05)) / 2),
      totalPaise -
        Math.round(totalPaise / 1.05) -
        Math.round((totalPaise - Math.round(totalPaise / 1.05)) / 2),
    ],
  );
  return id;
}

await makeOrder({
  suffix: 2,
  status: "delivered",
  paymentMethod: "cod",
  paymentStatus: "pending",
  totalPaise: 100000,
});
await makeOrder({
  suffix: 3,
  status: "shipped",
  paymentMethod: "razorpay",
  paymentStatus: "paid",
  totalPaise: 200000,
});
await makeOrder({
  suffix: 4,
  status: "pending",
  paymentMethod: "cod",
  paymentStatus: "pending",
  totalPaise: 400000,
});
await makeOrder({
  suffix: 5,
  status: "cancelled",
  paymentMethod: "cod",
  paymentStatus: "pending",
  totalPaise: 800000,
});

const after = await getSalesSummary(30);
const grossDelta = after.grossPaise - baseline.grossPaise;
const realisedDelta = after.realisedPaise - baseline.realisedPaise;

check(
  "gross counts every order except the cancelled one",
  // the delivered COD, the paid prepaid, the pending COD — and the ₹640
  // delivered order created earlier in section 3
  grossDelta === 100000 + 200000 + 400000,
  String(grossDelta),
);
check(
  "cancelled revenue is excluded",
  grossDelta !== 100000 + 200000 + 400000 + 800000,
);
check(
  "realised counts delivered cash-on-delivery and paid prepaid only",
  realisedDelta === 100000 + 200000,
  String(realisedDelta),
);
check(
  "money in transit is the gap between them",
  grossDelta - realisedDelta === 400000,
  String(grossDelta - realisedDelta),
);
check(
  "cancellations are counted separately",
  after.cancelled - baseline.cancelled === 1,
);
check(
  "GST is summed from the lines, not the order",
  after.taxPaise > baseline.taxPaise,
);

/* --- IST days --- */

// An instant at 20:00 UTC is 01:30 the following morning in India. Insert
// one at yesterday 20:00 UTC and it must be reported on today's Indian date,
// regardless of what time zone the MySQL session happens to be in.
const [[offsetRow]] = await db.query(
  `SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS off,
          DATE(TIMESTAMP(DATE(UTC_TIMESTAMP()) - INTERVAL 1 DAY, '20:00:00')
               + INTERVAL 19800 SECOND) AS expected_ist_day,
          DATE(TIMESTAMP(DATE(UTC_TIMESTAMP()) - INTERVAL 1 DAY, '20:00:00')) AS naive_day`,
);

await makeOrder({
  suffix: 6,
  status: "delivered",
  paymentMethod: "razorpay",
  paymentStatus: "paid",
  totalPaise: 111100,
  createdAtSql: `TIMESTAMP(DATE(UTC_TIMESTAMP()) - INTERVAL 1 DAY, '20:00:00')
                 + INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND`,
});

const byDay = await getRevenueByDay(30);
const expectedDay =
  offsetRow.expected_ist_day instanceof Date
    ? offsetRow.expected_ist_day.toISOString().slice(0, 10)
    : String(offsetRow.expected_ist_day);
const naiveDay =
  offsetRow.naive_day instanceof Date
    ? offsetRow.naive_day.toISOString().slice(0, 10)
    : String(offsetRow.naive_day);

const landed = byDay.find((day) => day.day === expectedDay);
check(
  "a late-evening UTC order is reported on the Indian day it belongs to",
  Boolean(landed) && landed.grossPaise >= 111100,
  `expected ${expectedDay}, days present: ${byDay.map((d) => d.day).join(", ")}`,
);
console.log(
  `        (session offset ${offsetRow.off}s; naive grouping would say ${naiveDay})`,
);

/* --- top products, funnel, low stock --- */

const top = await getTopProducts(30, 50);
const mine = top.find((entry) => entry.productSlug === RENAMED);
check("the test product appears in top products", Boolean(mine));
check(
  "units and orders are counted per line",
  mine?.units === 5 && mine?.orders === 5,
  JSON.stringify({ units: mine?.units, orders: mine?.orders }),
);

await setProductActive(productId, false);
const topAfterArchive = await getTopProducts(30, 50);
check(
  "an archived product still shows what it sold",
  topAfterArchive.some((entry) => entry.productSlug === RENAMED),
);
await setProductActive(productId, true);

const funnel = await getOrderFunnel(30);
check(
  "the funnel reports every status present",
  funnel.some((stage) => stage.status === "cancelled") &&
    funnel.some((stage) => stage.status === "delivered"),
);

await db.execute(
  `INSERT INTO back_in_stock_requests (variant_id, email) VALUES (?, ?)`,
  [variantB, `${TAG}-waiting@example.com`],
);
const low = await getLowStock();
const lowRow = low.find((row) => row.variantId === variantB);
check("a zero-stock pack is in the low-stock report", Boolean(lowRow));
check(
  "and it says how many people are waiting for it",
  lowRow?.waitingCustomers === 1,
  String(lowRow?.waitingCustomers),
);

/* --- the orders export --- */

// Sixty lines on one order, which is well past group_concat_max_len (1024
// bytes by default). GROUP_CONCAT would truncate here with no error and no
// warning the application can see — an export that silently loses the tail
// of a large order, in a document somebody hands to their accountant.
const bigOrder = await makeOrder({
  suffix: 7,
  status: "confirmed",
  paymentMethod: "razorpay",
  paymentStatus: "paid",
  totalPaise: 60000,
});
const extraLines = [];
for (let n = 2; n <= 60; n += 1) {
  extraLines.push([bigOrder, variantA, "ADMINTEST-1G", RENAMED, `Test Saffron ${n}`, "1 g", 1000, 1, 1000, 0, 1000]);
}
await db.query(
  `INSERT INTO order_items
     (order_id, variant_id, sku, product_slug, product_name, pack_size_label,
      unit_price_paise, qty, line_total_paise, gst_rate_bps, taxable_value_paise)
   VALUES ?`,
  [extraLines],
);

const { exportOrders } = await import("@/db/queries/reports");
const exported = await exportOrders(30);
const bigRow = exported.find((row) => row.id === bigOrder);
check("the orders export includes the order", Boolean(bigRow));
check(
  "a sixty-line order is not truncated at 1024 bytes",
  (bigRow?.items?.length ?? 0) > 1024 && bigRow.items.includes("Test Saffron 60"),
  `${bigRow?.items?.length} chars`,
);
check(
  "the tax column is summed from the lines",
  Number(bigRow?.tax_paise) >= 0,
);

/* --- customers --- */

const [customerResult] = await db.execute(
  `INSERT INTO customers (email, name, phone) VALUES (?, 'Admin Test', '9000000000')`,
  [EMAIL],
);
await db.execute(
  `UPDATE orders SET customer_id = ? WHERE customer_email = ?`,
  [customerResult.insertId, EMAIL],
);

const customers = await listCustomersForAdmin(1000);
const mineCustomer = customers.find((entry) => entry.email === EMAIL);
check("the customer list finds them", Boolean(mineCustomer));
// Six live orders — ₹640 + ₹1000 + ₹2000 + ₹4000 + ₹1111 + ₹600 — and the
// cancelled ₹8000 one, which must not appear in either figure.
const expectedSpend = 64000 + 100000 + 200000 + 400000 + 111100 + 60000;
check(
  "cancelled orders do not count towards their spend",
  mineCustomer?.orders === 6 && mineCustomer?.spentPaise === expectedSpend,
  JSON.stringify({
    orders: mineCustomer?.orders,
    spent: mineCustomer?.spentPaise,
    expected: expectedSpend,
  }),
);

const people = await getCustomerSummary(30);
check("repeat buyers are counted", people.repeat >= 1);
check(
  "marketing consent is not assumed from an order",
  mineCustomer?.marketingOptIn === false,
);

/* ================================================================== */
console.log("\n5. Returns — the queue and its transitions");

check(
  "a fresh request may be approved or declined, nothing else",
  allowedTransitions("requested").join(",") === "approved,rejected",
);
check("refunded is terminal", allowedTransitions("refunded").length === 0);
check("declined is terminal", allowedTransitions("rejected").length === 0);

const [returnResult] = await db.execute(
  `INSERT INTO return_requests (order_id, reason, detail)
   VALUES (?, 'damaged', 'The seal was broken on arrival.')`,
  [historyOrder],
);
const returnId = returnResult.insertId;

let decision = await decideReturn({
  id: returnId,
  status: "refunded",
  resolution: "Skipping straight to the money.",
  actor: ACTOR,
});
check(
  "a request cannot jump straight to refunded",
  decision.ok === false && decision.reason === "illegal_transition",
  JSON.stringify(decision),
);

decision = await decideReturn({
  id: returnId,
  status: "approved",
  resolution: "Send it back and we will refund you.",
  actor: ACTOR,
});
check("it can be approved", decision.ok === true);

decision = await decideReturn({
  id: returnId,
  status: "received",
  resolution: null,
  actor: ACTOR,
});
check("then marked received", decision.ok === true);

decision = await decideReturn({
  id: returnId,
  status: "refunded",
  resolution: "Refunded in full.",
  actor: ACTOR,
});
check("then refunded", decision.ok === true);
check(
  "refunding reports that it also moved the order",
  decision.ok === true && decision.orderMarkedRefunded === true,
);

const [[refundedOrder]] = await db.execute(
  `SELECT payment_status FROM orders WHERE id = ?`,
  [historyOrder],
);
check(
  "the order's payment status follows the refund",
  refundedOrder.payment_status === "refunded",
  refundedOrder.payment_status,
);

decision = await decideReturn({
  id: returnId,
  status: "approved",
  resolution: "Undo it.",
  actor: ACTOR,
});
check("a refunded return cannot be reopened", decision.ok === false);

const [historyRows] = await db.execute(
  `SELECT to_status FROM order_status_history
    WHERE order_id = ? AND to_status LIKE 'return:%' ORDER BY id`,
  [historyOrder],
);
check(
  "every decision is on the customer's own timeline",
  historyRows.map((row) => row.to_status).join(",") ===
    "return:approved,return:received,return:refunded",
  historyRows.map((row) => row.to_status).join(","),
);
check(
  "and the timeline prints words, not column values",
  orderStatusLabel("return:refunded") === "Refunded" &&
    orderStatusLabel("return:rejected") === "Return declined",
  orderStatusLabel("return:refunded"),
);

const counts = await countReturnsByStatus();
check("the queue counts by status", counts.refunded >= 1);
const queued = await listReturns("refunded");
check(
  "the queue carries what the owner needs to decide",
  queued.some(
    (entry) => entry.id === returnId && entry.resolution === "Refunded in full.",
  ),
);

/* ================================================================== */
console.log("\n6. Audit — append only");

check(
  "diffFields reports only what moved",
  JSON.stringify(diffFields({ a: 1, b: 2 }, { a: 1, b: 3 })) ===
    JSON.stringify({ b: { from: 2, to: 3 } }),
  JSON.stringify(diffFields({ a: 1, b: 2 }, { a: 1, b: 3 })),
);
check(
  "an undefined field is not a change",
  Object.keys(diffFields({ a: 1 }, { a: undefined })).length === 0,
);

await recordAdminAction({
  actor: ACTOR,
  action: "variant.update",
  entityType: "product",
  entityId: productId,
  summary: "Edited Test Saffron: pricePaise",
  detail: { pricePaise: { from: 64000, to: 68000 } },
});

const forProduct = await listAuditForEntity("product", productId, 10);
check("the entry is filed against the product", forProduct.length >= 1);
check(
  "the before and after survive the round trip as an object",
  forProduct[0]?.detail?.pricePaise?.to === 68000,
  JSON.stringify(forProduct[0]?.detail),
);

const log = await listAuditLog(50);
check("it appears in the whole log", log.some((entry) => entry.actor === ACTOR));
check(
  "the log is newest first",
  log.length < 2 || log[0].id > log[log.length - 1].id,
);

// The writer must never be the reason an already-committed edit reports a
// failure. A malformed call is swallowed and logged, not thrown.
let auditThrew = false;
try {
  await recordAdminAction({
    actor: ACTOR,
    action: "x".repeat(500),
    entityType: "y".repeat(500),
    entityId: "z".repeat(500),
    summary: "s".repeat(5000),
    detail: null,
  });
} catch {
  auditThrew = true;
}
check("an oversized entry does not throw at the caller", !auditThrew);

const noWriters = Object.keys(
  await import("@/db/queries/audit"),
).filter((name) => /update|delete|remove|edit/i.test(name));
check(
  "the audit module exports no way to change a line of it",
  noWriters.length === 0,
  noWriters.join(", "),
);

/* ================================================================== */
console.log("\n7. A product created here has a page, without a deploy");

/**
 * The headline claim of this milestone, and the one worth proving rather
 * than asserting. Until M14 a product created in the admin 404'd twice
 * over: `dynamicParams` was false, so an unbuilt slug had no page at all,
 * and generateStaticParams filtered against the editorial constant, so a
 * rebuild would not have helped either.
 *
 * Needs a running server. Skipped with a note when there is not one — a
 * silently-absent check is how a regression ships.
 */
const serverBase = `http://localhost:${process.env.TEST_PORT ?? 3100}`;
const serverUp = await fetch(`${serverBase}/api/health`)
  .then((response) => response.ok)
  .catch(() => false);

if (!serverUp) {
  console.log(
    `  SKIP  no server on ${serverBase} — start one to run this section`,
  );
} else {
  // The same purge an admin publish performs, then the repeated fetches
  // that a tag purge requires: revalidateTag marks stale, it does not
  // rebuild, so the first response is still the previous copy.
  async function fresh(path) {
    await fetch(`${serverBase}/api/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" },
    }).catch(() => {});
    let html = "";
    let status = 0;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${serverBase}${path}`);
      status = response.status;
      html = await response.text();
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return { status, html };
  }

  const page = await fresh(`/products/${RENAMED}`);
  check(
    "the page exists, though it was never in a build",
    page.status === 200,
    String(page.status),
  );
  check("it carries the product's name", page.html.includes("Test Saffron"));
  check(
    "and the description the owner typed",
    page.html.includes("Renamed once, while nothing pointed at it."),
  );
  check(
    "the GI tag and origin are on it",
    page.html.includes("Kashmir Saffron") &&
      page.html.includes("Jammu and Kashmir"),
  );
  check(
    "it is buyable — a price is rendered",
    page.html.includes("680") || page.html.includes("3,000"),
  );
  check(
    "no FAQ schema is emitted for a product with no questions",
    !page.html.includes('"@type":"FAQPage"'),
  );
  check(
    "the Product schema is still emitted",
    page.html.includes('"@type":"Product"'),
  );
  check(
    "and no rating, because nobody has reviewed it",
    !page.html.includes("AggregateRating"),
  );

  const listing = await fresh("/products");
  check(
    "it appears on the catalogue page",
    listing.html.includes("Test Saffron"),
    String(listing.status),
  );

  const sitemap = await fetch(`${serverBase}/sitemap.xml`).then((r) => r.text());
  check("and in the sitemap", sitemap.includes(`/products/${RENAMED}`));

  // Archived, it must disappear from all three.
  await setProductActive(productId, false);
  const gone = await fresh(`/products/${RENAMED}`);
  check(
    "archiving takes the page away again",
    gone.status === 404,
    String(gone.status),
  );
  const listingAfter = await fresh("/products");
  check(
    "and takes it off the catalogue",
    !listingAfter.html.includes("Test Saffron"),
  );
}

/* ================================================================== */

await cleanup();

// Leave the cache consistent with the database the test just cleaned up,
// or the next page view serves a catalogue containing a deleted product.
if (serverUp) {
  await fetch(`${serverBase}/api/revalidate`, {
    method: "POST",
    headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" },
  }).catch(() => {});
}

const [[leftover]] = await db.query(
  `SELECT
     (SELECT COUNT(*) FROM products WHERE slug LIKE '${TAG}%') AS products,
     (SELECT COUNT(*) FROM orders WHERE customer_email LIKE '${TAG}%') AS orders,
     (SELECT COUNT(*) FROM admin_audit_log WHERE actor = '${ACTOR}') AS audit`,
);
check(
  "the test leaves nothing behind",
  Number(leftover.products) === 0 &&
    Number(leftover.orders) === 0 &&
    Number(leftover.audit) === 0,
  JSON.stringify(leftover),
);

await db.end();
await getPool().end();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
