/**
 * Customer identity and order access acceptance tests (M8). Runs against a
 * live server + DB and asserts the properties that make order lookup safe
 * to expose without an auth provider:
 *
 *   - a customer row is created implicitly at checkout, and reused
 *   - order reference + email opens a session; either one wrong does not
 *   - failures are indistinguishable from each other
 *   - the lookup endpoint is rate limited harder than checkout
 *   - a session reads only its own orders
 *   - self-service cancel restores stock, and cannot be done without a
 *     session, twice, or on someone else's order
 *
 *   node scripts/test-account.mjs [port]
 *
 * Rate limiting is keyed per IP and the lookup bucket is only 5/min, so
 * this suite spends its budget deliberately and waits when it must.
 */
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

loadEnv();

const port = process.argv[2] ?? "3100";
const base = `http://localhost:${port}`;

const db = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? "ekmool",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "ekmool",
});

const BUYER = "account-test@example.com";
const OTHER = "account-other@example.com";

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cleanup() {
  // Put stock back for anything this suite placed and did not cancel, so a
  // run leaves the catalogue exactly as it found it.
  const [held] = await db.execute(
    `SELECT i.variant_id, i.qty
       FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.customer_email IN (?, ?)
        AND o.status <> 'cancelled'
        AND i.variant_id IS NOT NULL`,
    [BUYER, OTHER],
  );
  for (const row of held) {
    await db.execute(
      "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
      [row.qty, row.variant_id],
    );
  }

  // email_log is ON DELETE SET NULL, so it would otherwise keep orphans.
  await db.execute(
    `DELETE l FROM email_log l JOIN orders o ON o.id = l.order_id
      WHERE o.customer_email IN (?, ?)`,
    [BUYER, OTHER],
  );
  await db.execute("DELETE FROM orders WHERE customer_email IN (?, ?)", [
    BUYER,
    OTHER,
  ]);
  await db.execute("DELETE FROM customers WHERE email IN (?, ?)", [BUYER, OTHER]);
}

async function stockOf(variantId) {
  const [rows] = await db.execute(
    "SELECT stock_qty FROM product_variants WHERE id = ?",
    [variantId],
  );
  return Number(rows[0].stock_qty);
}

function post(path, body, headers = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** One COD order, placed exactly the way a customer would. */
async function placeOrder(variantId, email, qty = 1) {
  const response = await post(
    "/api/checkout",
    {
      customer: { name: "Account Tester", email, phone: "9876543210" },
      address: {
        line1: "12 Residency Road",
        line2: "",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560025",
        landmark: "",
      },
      paymentMethod: "cod",
      items: [{ variantId, qty }],
      notes: "",
    },
    { "idempotency-key": `acct-${email}-${Date.now()}-${Math.random()}` },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`checkout failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data.orderId;
}

/** Extracts the ek_session cookie so later requests can present it. */
function sessionCookie(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  const cookie = raw.find((value) => value.startsWith("ek_session="));
  return cookie ? cookie.split(";")[0] : null;
}

await cleanup();

const [variantRows] = await db.execute(
  "SELECT id, sku, stock_qty FROM product_variants ORDER BY id LIMIT 1",
);
const variant = variantRows[0];

console.log(`Running account tests against ${base}\n`);

/* ------------------------------------------------------------------ */
console.log("1. Customer created implicitly at checkout");

const orderId = await placeOrder(variant.id, BUYER);
const reference = orderId.slice(-8).toUpperCase();

{
  const [rows] = await db.execute(
    "SELECT id, name, phone, marketing_opt_in FROM customers WHERE email = ?",
    [BUYER],
  );
  check("a customer row exists", rows.length === 1);
  check(
    "marketing consent is not assumed",
    rows.length === 1 && rows[0].marketing_opt_in === 0,
  );

  const [orderRows] = await db.execute(
    "SELECT customer_id, order_ref FROM orders WHERE id = ?",
    [orderId],
  );
  check(
    "the order is linked to that customer",
    rows.length === 1 && orderRows[0]?.customer_id === rows[0].id,
  );
  check(
    "order_ref matches the printed reference",
    orderRows[0]?.order_ref === reference,
    `${orderRows[0]?.order_ref} vs ${reference}`,
  );

  // A second order from the same address must not create a second customer.
  await placeOrder(variant.id, BUYER);
  const [again] = await db.execute(
    "SELECT COUNT(*) AS n FROM customers WHERE email = ?",
    [BUYER],
  );
  check("a repeat order reuses the customer", Number(again[0].n) === 1);
}

/* ------------------------------------------------------------------ */
console.log("\n2. Lookup — the wrong answers are indistinguishable");

let wrongEmail;
let wrongRef;
{
  wrongEmail = await post("/api/account/lookup", {
    reference,
    email: "not-the-buyer@example.com",
  });
  const wrongEmailBody = await wrongEmail.json();

  wrongRef = await post("/api/account/lookup", {
    reference: "ZZZZZZZZ",
    email: BUYER,
  });
  const wrongRefBody = await wrongRef.json();

  check("wrong email is rejected", wrongEmail.status === 404, `got ${wrongEmail.status}`);
  check("unknown reference is rejected", wrongRef.status === 404, `got ${wrongRef.status}`);
  check(
    "both failures are byte-identical",
    JSON.stringify(wrongEmailBody) === JSON.stringify(wrongRefBody),
  );
  check(
    "neither sets a session",
    sessionCookie(wrongEmail) === null && sessionCookie(wrongRef) === null,
  );
  check(
    "a malformed reference is a validation error, not a lookup",
    (await post("/api/account/lookup", { reference: "!!", email: BUYER })).status === 422,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n3. Lookup is rate limited to 5/min");

{
  // Three spent above (two failures plus the malformed one, which still
  // passes through the limiter). The next attempts should exhaust it.
  const statuses = [];
  for (let i = 0; i < 4; i += 1) {
    const response = await post("/api/account/lookup", {
      reference: "ZZZZZZZZ",
      email: BUYER,
    });
    statuses.push(response.status);
  }
  check(
    "the bucket runs out inside 7 attempts",
    statuses.includes(429),
    `statuses: ${statuses.join(",")}`,
  );

  console.log("     waiting 65s for the bucket to refill…");
  await sleep(65_000);
}

/* ------------------------------------------------------------------ */
console.log("\n4. Correct reference + email opens a session");

let cookie;
{
  const response = await post("/api/account/lookup", { reference, email: BUYER });
  const data = await response.json();
  cookie = sessionCookie(response);

  check("returns the order", response.status === 200 && data.orderId === orderId);
  check("sets a session cookie", cookie !== null);
  check(
    "the cookie is httpOnly and same-site lax",
    (response.headers.getSetCookie?.() ?? []).some(
      (value) =>
        value.startsWith("ek_session=") &&
        /httponly/i.test(value) &&
        /samesite=lax/i.test(value),
    ),
  );
  check(
    "the reference is accepted case-insensitively and with a #",
    (await post("/api/account/lookup", {
      reference: `#${reference.toLowerCase()}`,
      email: BUYER.toUpperCase(),
    })).status === 200,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n5. A session reads only its own orders");

const otherOrderId = await placeOrder(variant.id, OTHER);
{
  const mine = await fetch(`${base}/track`, { headers: { cookie } });
  const html = await mine.text();
  check("the track page lists my order", html.includes(reference));
  check(
    "and not another customer's",
    !html.includes(otherOrderId.slice(-8).toUpperCase()),
  );

  const forged = await post(
    `/api/orders/${otherOrderId}/cancel`,
    {},
    { cookie },
  );
  check(
    "cancelling another customer's order is refused",
    forged.status === 404,
    `got ${forged.status}`,
  );
  const [stillOpen] = await db.execute("SELECT status FROM orders WHERE id = ?", [
    otherOrderId,
  ]);
  check("and left it untouched", stillOpen[0].status !== "cancelled");

  const tampered = await post(
    `/api/orders/${orderId}/cancel`,
    {},
    { cookie: "ek_session=forged.deadbeef" },
  );
  check(
    "a forged cookie is not a session",
    tampered.status === 401,
    `got ${tampered.status}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n6. Self-service cancel");

{
  const anonymous = await post(`/api/orders/${orderId}/cancel`, {});
  check(
    "cancelling without a session is refused",
    anonymous.status === 401,
    `got ${anonymous.status}`,
  );

  const before = await stockOf(variant.id);
  const response = await post(`/api/orders/${orderId}/cancel`, {}, { cookie });
  const data = await response.json();
  check("the owner can cancel", response.status === 200 && data.ok === true);

  const after = await stockOf(variant.id);
  check(
    "stock is restored",
    after === before + 1,
    `${before} → ${after}`,
  );

  const [rows] = await db.execute("SELECT status FROM orders WHERE id = ?", [orderId]);
  check("the order is cancelled", rows[0].status === "cancelled");

  const [history] = await db.execute(
    "SELECT to_status, actor FROM order_status_history WHERE order_id = ? ORDER BY id DESC LIMIT 1",
    [orderId],
  );
  check(
    "the history records who did it",
    history[0].to_status === "cancelled" && history[0].actor === "customer",
  );

  const repeat = await post(`/api/orders/${orderId}/cancel`, {}, { cookie });
  check("cancelling twice is refused", repeat.status === 409, `got ${repeat.status}`);
  check(
    "and does not restore stock twice",
    (await stockOf(variant.id)) === after,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n7. Cancel is refused once an order is packed");

{
  const packedId = await placeOrder(variant.id, BUYER);
  await db.execute("UPDATE orders SET status = 'packed' WHERE id = ?", [packedId]);

  const response = await post(`/api/orders/${packedId}/cancel`, {}, { cookie });
  check("a packed order cannot be cancelled", response.status === 409, `got ${response.status}`);

  await db.execute(
    "UPDATE orders SET status = 'confirmed', payment_status = 'paid' WHERE id = ?",
    [packedId],
  );
  const prepaid = await post(`/api/orders/${packedId}/cancel`, {}, { cookie });
  const prepaidBody = await prepaid.json();
  check(
    "a prepaid order is sent to us for a refund rather than silently cancelled",
    prepaid.status === 409 && prepaidBody.code === "PREPAID",
    `got ${prepaid.status} ${prepaidBody.code}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n8. Sign out");

{
  const response = await post("/api/account/logout", {}, { cookie });
  const cleared = (response.headers.getSetCookie?.() ?? []).find((value) =>
    value.startsWith("ek_session="),
  );
  check("logout clears the cookie", response.status === 200 && /ek_session=;/.test(cleared ?? ""));
  check(
    "a GET cannot sign anyone out",
    (await fetch(`${base}/api/account/logout`)).status === 405,
  );
}

/* ---------- cleanup ---------- */
await cleanup();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
}

await db.end();
process.exit(failures.length ? 1 : 0);
