/**
 * Admin + jobs acceptance tests.
 *
 *   node scripts/test-jobs.mjs [port]
 *
 * Covers the M5 definition of done: admin is invisible without Clerk,
 * job routes are secret-protected, the stale-order sweep restores stock
 * correctly, and reminders are sent at most once per order.
 */
import mysql from "mysql2/promise";
import { ulid } from "ulidx";
import { loadEnv } from "./load-env.mts";

loadEnv();

const port = process.argv[2] ?? "3100";
const base = `http://localhost:${port}`;
const secret = process.env.CRON_SECRET ?? "";

const db = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? "ekmool",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "ekmool",
});

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

function job(name, headers = {}) {
  return fetch(`${base}/api/jobs/${name}`, { method: "POST", headers });
}

async function stockOf(variantId) {
  const [rows] = await db.execute(
    "SELECT stock_qty FROM product_variants WHERE id = ?",
    [variantId],
  );
  return Number(rows[0].stock_qty);
}

console.log(`\nAdmin + jobs against ${base}`);
console.log(secret ? "CRON_SECRET is set\n" : "CRON_SECRET is NOT set\n");

/* ---------- 1. Admin is invisible without Clerk ---------- */
console.log("1. Admin surface without Clerk keys");
{
  for (const path of ["/admin", "/admin/stock", "/account"]) {
    const response = await fetch(`${base}${path}`);
    check(
      `${path} returns 404 (not 403, not 500)`,
      response.status === 404,
      `got ${response.status}`,
    );
  }

  const robots = await (await fetch(`${base}/robots.txt`)).text();
  check("robots.txt disallows /admin", robots.includes("/admin"));

  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  check("sitemap does not list /admin", !sitemap.includes("/admin"));
}

/* ---------- 2. Job routes are protected ---------- */
console.log("\n2. Job authorisation");
{
  const JOBS = [
    "abandoned-payment-reminder",
    "low-stock-report",
    "cancel-stale-orders",
  ];

  for (const name of JOBS) {
    const noSecret = await job(name);
    check(
      `${name} rejects a request with no secret`,
      noSecret.status === 401 || noSecret.status === 503,
      `got ${noSecret.status}`,
    );

    const wrongSecret = await job(name, { "x-cron-secret": "wrong-secret" });
    check(
      `${name} rejects a wrong secret`,
      wrongSecret.status === 401 || wrongSecret.status === 503,
      `got ${wrongSecret.status}`,
    );
  }

  if (!secret) {
    console.log(
      "  note  CRON_SECRET unset — routes fail closed with 503, which is the intended behaviour",
    );
  }
}

if (!secret) {
  console.log("\nSkipping job execution tests (set CRON_SECRET to run them).");
  console.log(`\n${passed} passed, ${failures.length} failed`);
  await db.end();
  process.exit(failures.length ? 1 : 0);
}

const auth = { "x-cron-secret": secret };

/* ---------- 3. Low stock report ---------- */
console.log("\n3. Low stock report");
{
  const [variants] = await db.execute(
    "SELECT id, low_stock_threshold, stock_qty FROM product_variants ORDER BY id LIMIT 1",
  );
  const variant = variants[0];
  const originalStock = Number(variant.stock_qty);

  await db.execute("UPDATE product_variants SET stock_qty = 2 WHERE id = ?", [
    variant.id,
  ]);

  const response = await job("low-stock-report", auth);
  const data = await response.json();

  check("returns 200 with a valid secret", response.status === 200, `got ${response.status}`);
  check("detects the low variant", data.lowCount >= 1, JSON.stringify(data));

  await db.execute("UPDATE product_variants SET stock_qty = ? WHERE id = ?", [
    originalStock,
    variant.id,
  ]);
}

/* ---------- 4. Stale order cancellation restores stock ---------- */
console.log("\n4. Stale-order sweep restores stock");
{
  const [variants] = await db.execute(
    "SELECT id, sku FROM product_variants ORDER BY id LIMIT 1",
  );
  const variant = variants[0];
  const before = await stockOf(variant.id);

  // A pending razorpay order, backdated beyond the 48h window, holding 4 units.
  const orderId = ulid();
  await db.execute(
    `INSERT INTO orders
       (id, idempotency_key, customer_name, customer_email, customer_phone,
        address_line1, address_city, address_state, address_pincode,
        payment_method, payment_status, subtotal_paise, shipping_paise,
        total_paise, status, created_at)
     VALUES (?, ?, 'Stale Test', 'stale@example.com', '9876543210',
             '1 Test Road', 'Bengaluru', 'Karnataka', '560025',
             'razorpay', 'pending', 100000, 0, 100000, 'pending',
             NOW() - INTERVAL 72 HOUR)`,
    [orderId, `stale-test-${orderId}`],
  );
  await db.execute(
    `INSERT INTO order_items
       (order_id, variant_id, sku, product_slug, product_name,
        pack_size_label, unit_price_paise, qty, line_total_paise)
     VALUES (?, ?, ?, 'test-slug', 'Test Product', '100 g', 25000, 4, 100000)`,
    [orderId, variant.id, variant.sku],
  );
  // Simulate the stock this order is holding.
  await db.execute(
    "UPDATE product_variants SET stock_qty = stock_qty - 4 WHERE id = ?",
    [variant.id],
  );
  const held = await stockOf(variant.id);
  check("stock is held by the pending order", held === before - 4, `${before} → ${held}`);

  const response = await job("cancel-stale-orders", auth);
  const data = await response.json();

  check("returns 200", response.status === 200, `got ${response.status}`);
  check(
    "cancelled the backdated order",
    Array.isArray(data.orders) && data.orders.includes(orderId),
    JSON.stringify(data),
  );
  check("reports 4 units restored", data.unitsRestored >= 4, JSON.stringify(data));

  const after = await stockOf(variant.id);
  check("stock is back to its original value", after === before, `${held} → ${after}`);

  const [orderRows] = await db.execute(
    "SELECT status, payment_status FROM orders WHERE id = ?",
    [orderId],
  );
  check("order marked cancelled", orderRows[0].status === "cancelled");

  const [history] = await db.execute(
    "SELECT to_status, actor FROM order_status_history WHERE order_id = ? ORDER BY id DESC LIMIT 1",
    [orderId],
  );
  check(
    "cancellation recorded in status history by the job",
    history[0]?.to_status === "cancelled" &&
      history[0]?.actor === "job:cancel-stale-orders",
    JSON.stringify(history[0]),
  );

  // Re-running must be a no-op — the order is no longer pending.
  const second = await job("cancel-stale-orders", auth);
  const secondData = await second.json();
  check(
    "re-running does not double-restore stock",
    !secondData.orders.includes(orderId) && (await stockOf(variant.id)) === before,
  );

  await db.execute("DELETE FROM orders WHERE id = ?", [orderId]);
}

/* ---------- 5. Reminder is sent at most once ---------- */
console.log("\n5. Abandoned-payment reminder fires once only");
{
  const orderId = ulid();
  await db.execute(
    `INSERT INTO orders
       (id, idempotency_key, customer_name, customer_email, customer_phone,
        address_line1, address_city, address_state, address_pincode,
        payment_method, payment_status, subtotal_paise, shipping_paise,
        total_paise, status, created_at)
     VALUES (?, ?, 'Reminder Test', 'reminder@example.com', '9876543210',
             '1 Test Road', 'Bengaluru', 'Karnataka', '560025',
             'razorpay', 'pending', 50000, 4900, 54900, 'pending',
             NOW() - INTERVAL 3 HOUR)`,
    [orderId, `reminder-test-${orderId}`],
  );

  const first = await job("abandoned-payment-reminder", auth);
  const firstData = await first.json();
  check("returns 200", first.status === 200, `got ${first.status}`);
  check("sent one reminder", firstData.sent >= 1, JSON.stringify(firstData));

  const [logged] = await db.execute(
    "SELECT COUNT(*) AS n FROM email_log WHERE order_id = ? AND template = 'payment_reminder'",
    [orderId],
  );
  check("reminder logged once in email_log", Number(logged[0].n) === 1);

  const [stamped] = await db.execute(
    "SELECT reminder_sent_at FROM orders WHERE id = ?",
    [orderId],
  );
  check("reminder_sent_at stamped", stamped[0].reminder_sent_at !== null);

  // Second run must not touch it again.
  await job("abandoned-payment-reminder", auth);
  const [loggedAgain] = await db.execute(
    "SELECT COUNT(*) AS n FROM email_log WHERE order_id = ? AND template = 'payment_reminder'",
    [orderId],
  );
  check(
    "a second run does not send a duplicate",
    Number(loggedAgain[0].n) === 1,
    `email_log rows: ${loggedAgain[0].n}`,
  );

  await db.execute("DELETE FROM orders WHERE id = ?", [orderId]);
}

/* ---------- cleanup ---------- */
await db.execute(
  "DELETE FROM orders WHERE customer_email IN ('stale@example.com','reminder@example.com')",
);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
}

await db.end();
process.exit(failures.length ? 1 : 0);
