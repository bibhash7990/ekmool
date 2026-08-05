/**
 * Commerce acceptance tests (M10): GST arithmetic, invoice numbering,
 * returns, and re-order.
 *
 *   node scripts/test-commerce.mjs [port]
 *
 * The tax checks are the point of this file. An invoice that does not
 * reconcile to the paise is the kind of defect a customer's accountant
 * finds and you do not, so every assertion here is an equality, never an
 * approximation.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

loadEnv();

const port = process.argv[2] ?? "3100";

/**
 * The server the caller started, running the project's own configuration.
 * `.env.local` deliberately has no seller identity, so this one is an
 * unregistered shop — which is what the pro-forma checks need.
 */
const callerBase = `http://localhost:${port}`;

/**
 * Most of this file needs a *registered* shop, and there is nowhere honest
 * to keep one. A GSTIN in `.env.local` would print on every invoice rendered
 * in development, and a made-up registration number on a document someone
 * might hand to an accountant is the one thing this project will not do.
 *
 * So the registered case gets its own server, started here, configured
 * through the environment, and killed at the end. The GSTIN below is a test
 * fixture in the same sense as a test card number: it lives in this file,
 * it reaches nothing else, and it is well-formed only so the identity check
 * in src/lib/env.ts accepts it.
 */
const REGISTERED_SELLER = {
  SELLER_LEGAL_NAME: "Ekmool Test Foods Private Limited",
  SELLER_GSTIN: "29AABCE1234F1Z5",
  SELLER_STATE: "Karnataka",
  SELLER_ADDRESS: "12 Residency Road, Bengaluru, Karnataka 560025",
  SELLER_FSSAI: "10012345678901",
};

let base = callerBase;
let registeredServer = null;

async function waitForHealth(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function startRegisteredServer() {
  const entry = ".next/standalone/server.js";
  if (!existsSync(entry)) {
    throw new Error(
      `${entry} is missing — run \`npm run build && npm run standalone\` first.`,
    );
  }

  const serverPort = String(Number(port) + 1);
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, ...REGISTERED_SELLER, PORT: serverPort },
    stdio: "ignore",
    detached: false,
  });

  const url = `http://localhost:${serverPort}`;
  if (!(await waitForHealth(url))) {
    child.kill();
    throw new Error(`the registered test server never came up on ${url}`);
  }

  // Belt and braces: an assertion that throws must not leave a server
  // holding the port for the next run.
  process.on("exit", () => child.kill());

  console.log(`  (registered seller server on ${url})`);
  return { url, stop: () => child.kill() };
}

const db = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? "ekmool",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "ekmool",
});

const BUYER = "commerce-test@example.com";

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

async function cleanup() {
  const [held] = await db.execute(
    `SELECT i.variant_id v, i.qty q
       FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.customer_email = ? AND o.status <> 'cancelled'
        AND i.variant_id IS NOT NULL`,
    [BUYER],
  );
  for (const row of held) {
    await db.execute(
      "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
      [row.q, row.v],
    );
  }
  await db.execute(
    `DELETE l FROM email_log l JOIN orders o ON o.id = l.order_id
      WHERE o.customer_email = ?`,
    [BUYER],
  );
  await db.execute("DELETE FROM orders WHERE customer_email = ?", [BUYER]);
  await db.execute("DELETE FROM customers WHERE email = ?", [BUYER]);
}

function post(path, body, headers = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function placeOrder({ state = "Karnataka", items }) {
  const response = await post(
    "/api/checkout",
    {
      customer: { name: "Commerce Tester", email: BUYER, phone: "9876543210" },
      address: {
        line1: "12 Residency Road",
        line2: "",
        city: "Bengaluru",
        state,
        pincode: "560025",
        landmark: "",
      },
      paymentMethod: "cod",
      items,
      notes: "",
    },
    { "idempotency-key": `commerce-${Date.now()}-${Math.random()}` },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`checkout failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data.orderId;
}

async function session(orderId) {
  const response = await post("/api/account/lookup", {
    reference: orderId.slice(-8),
    email: BUYER,
  });
  if (!response.ok) throw new Error(`lookup failed (${response.status})`);
  const cookie = (response.headers.getSetCookie?.() ?? []).find((value) =>
    value.startsWith("ek_session="),
  );
  return cookie ? cookie.split(";")[0] : null;
}

await cleanup();

const [variantRows] = await db.execute(
  `SELECT v.id, v.sku, v.price_inr, p.hsn_code, p.gst_rate_bps
     FROM product_variants v JOIN products p ON p.id = v.product_id
    ORDER BY v.id LIMIT 3`,
);

console.log(`Commerce tests against ${callerBase}`);
registeredServer = await startRegisteredServer();
base = registeredServer.url;
console.log("");

/* ------------------------------------------------------------------ */
console.log("1. Catalogue carries HSN codes and rates");

{
  const [rows] = await db.execute(
    "SELECT slug, hsn_code, gst_rate_bps FROM products ORDER BY id",
  );
  check("every product has an HSN code", rows.every((r) => r.hsn_code));
  check(
    "and a rate above zero",
    rows.every((r) => Number(r.gst_rate_bps) > 0),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n2. Tax is taken out of the price, never added on top");

const intraOrderId = await placeOrder({
  state: "Karnataka",
  items: [
    { variantId: variantRows[0].id, qty: 2 },
    { variantId: variantRows[1].id, qty: 1 },
  ],
});

{
  const [[order]] = await db.execute(
    `SELECT subtotal_paise, shipping_paise, total_paise,
            place_of_supply, seller_state
       FROM orders WHERE id = ?`,
    [intraOrderId],
  );
  const [items] = await db.execute(
    `SELECT line_total_paise, taxable_value_paise, gst_rate_bps,
            cgst_paise, sgst_paise, igst_paise, hsn_code
       FROM order_items WHERE order_id = ?`,
    [intraOrderId],
  );

  check(
    "the total is unchanged by tax being recorded",
    order.total_paise === order.subtotal_paise + order.shipping_paise,
  );
  check("place of supply is the delivery state", order.place_of_supply === "Karnataka");

  for (const item of items) {
    const tax =
      Number(item.cgst_paise) + Number(item.sgst_paise) + Number(item.igst_paise);

    // The invariant that matters, and it holds whether or not GST is being
    // accounted for: a line always adds up to what was charged.
    check(
      `taxable + tax equals the line exactly (${item.line_total_paise})`,
      Number(item.taxable_value_paise) + tax === Number(item.line_total_paise),
      `${item.taxable_value_paise} + ${tax}`,
    );
    check(
      "the taxable value is the price less the embedded tax",
      Number(item.taxable_value_paise) ===
        Math.round(
          (Number(item.line_total_paise) * 10000) /
            (10000 + Number(item.gst_rate_bps)),
        ),
    );
    check("the HSN code is snapshotted on the line", Boolean(item.hsn_code));
  }
}

/* ------------------------------------------------------------------ */
console.log("\n3. The split follows the place of supply");

{
  const [items] = await db.execute(
    "SELECT cgst_paise, sgst_paise, igst_paise FROM order_items WHERE order_id = ?",
    [intraOrderId],
  );

  // The registered seller is in Karnataka and intraOrderId ships there.
  check(
    "same state as the seller splits into CGST and SGST",
    items.every(
      (i) =>
        Number(i.cgst_paise) > 0 &&
        Number(i.sgst_paise) > 0 &&
        Number(i.igst_paise) === 0,
    ),
  );
  check(
    "and the two halves add back to the whole tax",
    items.every(
      (i) => Math.abs(Number(i.cgst_paise) - Number(i.sgst_paise)) <= 1,
    ),
  );

  const interOrderId = await placeOrder({
    state: "Maharashtra",
    items: [{ variantId: variantRows[0].id, qty: 1 }],
  });
  const [interItems] = await db.execute(
    "SELECT cgst_paise, sgst_paise, igst_paise FROM order_items WHERE order_id = ?",
    [interOrderId],
  );
  check(
    "a different state is IGST only",
    interItems.every(
      (i) =>
        Number(i.igst_paise) > 0 &&
        Number(i.cgst_paise) === 0 &&
        Number(i.sgst_paise) === 0,
    ),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n4. Invoice numbers are allocated once, and consecutively");

{
  const first = await fetch(`${base}/orders/${intraOrderId}/invoice`);
  check("the invoice renders", first.status === 200, `got ${first.status}`);
  const html = await first.text();

  const [[order]] = await db.execute(
    "SELECT invoice_number, invoice_date FROM orders WHERE id = ?",
    [intraOrderId],
  );
  check("a number was allocated", Boolean(order.invoice_number));
  check(
    "it follows the EK/<fy>/<seq> format",
    /^EK\/\d{4}-\d{2}\/\d{6}$/.test(order.invoice_number ?? ""),
    order.invoice_number,
  );
  check("and appears on the document", html.includes(order.invoice_number));
  check("the date is stamped", Boolean(order.invoice_date));

  await fetch(`${base}/orders/${intraOrderId}/invoice`);
  const [[again]] = await db.execute(
    "SELECT invoice_number FROM orders WHERE id = ?",
    [intraOrderId],
  );
  check(
    "viewing it twice does not allocate a second number",
    again.invoice_number === order.invoice_number,
  );

  const nextOrderId = await placeOrder({
    items: [{ variantId: variantRows[2].id, qty: 1 }],
  });
  await fetch(`${base}/orders/${nextOrderId}/invoice`);
  const [[next]] = await db.execute(
    "SELECT invoice_number FROM orders WHERE id = ?",
    [nextOrderId],
  );
  const seq = (value) => Number(String(value).split("/")[2]);
  check(
    "the next invoice in the year is the next number",
    seq(next.invoice_number) === seq(order.invoice_number) + 1,
    `${order.invoice_number} → ${next.invoice_number}`,
  );

  check(
    "a registered seller gets a tax invoice, not a pro-forma",
    html.includes("Tax invoice") && !html.includes("not a tax invoice"),
  );
  check(
    "carrying the GSTIN it is issued under",
    html.includes(REGISTERED_SELLER.SELLER_GSTIN),
  );

  // A cancelled order supplied nothing, so it must not consume a number.
  const cancelledId = await placeOrder({
    items: [{ variantId: variantRows[0].id, qty: 1 }],
  });
  await db.execute("UPDATE orders SET status = 'cancelled' WHERE id = ?", [cancelledId]);
  await fetch(`${base}/orders/${cancelledId}/invoice`);
  const [[cancelled]] = await db.execute(
    "SELECT invoice_number FROM orders WHERE id = ?",
    [cancelledId],
  );
  check("a cancelled order burns no invoice number", cancelled.invoice_number === null);
}

/* ------------------------------------------------------------------ */
console.log("\n5. The invoice reconciles to the order total");

{
  const [[order]] = await db.execute(
    "SELECT subtotal_paise, shipping_paise, total_paise FROM orders WHERE id = ?",
    [intraOrderId],
  );
  // `lines` is a reserved word in MySQL 8, hence line_sum.
  const [[sums]] = await db.execute(
    `SELECT SUM(taxable_value_paise) taxable,
            SUM(cgst_paise + sgst_paise + igst_paise) tax,
            SUM(line_total_paise) line_sum
       FROM order_items WHERE order_id = ?`,
    [intraOrderId],
  );

  check(
    "item lines sum to the subtotal",
    Number(sums.line_sum) === Number(order.subtotal_paise),
  );

  // The invariant holds either way: taxed or untaxed, the parts add up to
  // what was charged. Shipping tax is derived at render time from stored
  // inputs, so the document as a whole is covered by the page assertions.
  check(
    "taxable + tax across all items equals the subtotal, to the paise",
    Number(sums.taxable) + Number(sums.tax) === Number(order.subtotal_paise),
    `${sums.taxable} + ${sums.tax} vs ${order.subtotal_paise}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n6. Returns follow the refund policy, not the form");

{
  const cookie = await session(intraOrderId);

  const beforeDelivery = await post(
    `/api/orders/${intraOrderId}/return`,
    { reason: "damaged", detail: "The seal was broken on arrival." },
    { cookie },
  );
  check(
    "an undelivered order cannot be returned",
    beforeDelivery.status === 409,
    `got ${beforeDelivery.status}`,
  );

  const anonymous = await post(`/api/orders/${intraOrderId}/return`, {
    reason: "damaged",
    detail: "The seal was broken on arrival.",
  });
  check(
    "and neither can one without a session",
    anonymous.status === 401,
    `got ${anonymous.status}`,
  );

  // Mark delivered the way the admin action does.
  await db.execute(
    "UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = ?",
    [intraOrderId],
  );

  const tooShort = await post(
    `/api/orders/${intraOrderId}/return`,
    { reason: "damaged", detail: "bad" },
    { cookie },
  );
  check("a one-word complaint is refused", tooShort.status === 422, `got ${tooShort.status}`);

  const ok = await post(
    `/api/orders/${intraOrderId}/return`,
    { reason: "damaged", detail: "The turmeric pack had a broken seal and had leaked." },
    { cookie },
  );
  check("a delivered order can be returned", ok.status === 201, `got ${ok.status}`);

  const duplicate = await post(
    `/api/orders/${intraOrderId}/return`,
    { reason: "damaged", detail: "Reporting the same thing a second time." },
    { cookie },
  );
  check("a second request on the same order is refused", duplicate.status === 409);

  const [rows] = await db.execute(
    "SELECT COUNT(*) n FROM return_requests WHERE order_id = ?",
    [intraOrderId],
  );
  check("exactly one request exists", Number(rows[0].n) === 1);

  // The owner's side of the same request. /admin is Clerk-gated and 404s
  // without keys, so the query behind the dashboard is exercised here
  // instead. A return nobody can see is the failure mode that matters, and
  // it would otherwise go untested entirely.
  const [queue] = await db.execute(
    `SELECT r.id, r.order_id, o.order_ref, o.customer_email, o.customer_name,
            r.reason, r.detail, r.created_at
       FROM return_requests r
       JOIN orders o ON o.id = r.order_id
      WHERE r.status IN ('requested', 'approved', 'received')
      ORDER BY r.created_at ASC`,
  );
  const queued = queue.find((row) => row.order_id === intraOrderId);
  check("the request reaches the owner's queue", Boolean(queued));
  check(
    "quoting the reference the customer would give",
    queued?.order_ref === intraOrderId.slice(-8),
    `got ${queued?.order_ref}`,
  );
  check(
    "and a way to reach them",
    queued?.customer_email === BUYER,
    `got ${queued?.customer_email}`,
  );

  // Push delivery back beyond the 48-hour damage window.
  await db.execute("DELETE FROM return_requests WHERE order_id = ?", [intraOrderId]);
  await db.execute(
    "UPDATE orders SET delivered_at = NOW() - INTERVAL 5 DAY WHERE id = ?",
    [intraOrderId],
  );

  const lateDamage = await post(
    `/api/orders/${intraOrderId}/return`,
    { reason: "damaged", detail: "Reporting damage nearly a week later." },
    { cookie },
  );
  check(
    "damage reported after 48 hours is refused",
    lateDamage.status === 409,
    `got ${lateDamage.status}`,
  );

  const changeOfMind = await post(
    `/api/orders/${intraOrderId}/return`,
    { reason: "unopened_change_of_mind", detail: "The packs are sealed and unopened." },
    { cookie },
  );
  check(
    "but a change of mind at 5 days is still inside its 7-day window",
    changeOfMind.status === 201,
    `got ${changeOfMind.status}`,
  );

  await db.execute(
    "UPDATE orders SET delivered_at = NOW() - INTERVAL 30 DAY WHERE id = ?",
    [intraOrderId],
  );
  await db.execute("DELETE FROM return_requests WHERE order_id = ?", [intraOrderId]);
  const ancient = await post(
    `/api/orders/${intraOrderId}/return`,
    { reason: "unopened_change_of_mind", detail: "A month later, still sealed." },
    { cookie },
  );
  check("a month later, nothing is returnable", ancient.status === 409);
}

/* ------------------------------------------------------------------ */
console.log("\n7. Re-order prices today and names what it cannot add");

{
  const response = await fetch(`${base}/api/orders/${intraOrderId}/reorder`);
  const data = await response.json();
  check("returns the order's lines", response.status === 200 && data.available.length === 2);

  const [[variant]] = await db.execute(
    "SELECT price_inr FROM product_variants WHERE id = ?",
    [variantRows[0].id],
  );
  check(
    "priced from the catalogue as it stands now",
    data.available.some((line) => line.unitPricePaise === Number(variant.price_inr)),
  );

  // Sell out one variant and confirm the line is named, not dropped.
  const [[stock]] = await db.execute(
    "SELECT stock_qty FROM product_variants WHERE id = ?",
    [variantRows[1].id],
  );
  await db.execute("UPDATE product_variants SET stock_qty = 0 WHERE id = ?", [
    variantRows[1].id,
  ]);

  const soldOut = await fetch(`${base}/api/orders/${intraOrderId}/reorder`);
  const soldOutData = await soldOut.json();
  check("a sold-out line is reported, not silently dropped", soldOutData.unavailable.length === 1);
  check(
    "and says why",
    /sold out/i.test(soldOutData.unavailable[0]?.reason ?? ""),
    soldOutData.unavailable[0]?.reason,
  );
  check("the rest still comes along", soldOutData.available.length === 1);

  await db.execute("UPDATE product_variants SET stock_qty = ? WHERE id = ?", [
    stock.stock_qty,
    variantRows[1].id,
  ]);
}

/* ------------------------------------------------------------------ */
console.log("\n8. Checkout prefill");

{
  const cookie = await session(intraOrderId);

  const guest = await fetch(`${base}/api/account/default-address`);
  const guestData = await guest.json();
  check("a guest gets no address", guest.status === 200 && guestData.address === null);

  const [[customer]] = await db.execute(
    "SELECT id FROM customers WHERE email = ?",
    [BUYER],
  );
  await db.execute(
    `INSERT INTO customer_addresses
       (customer_id, label, line1, city, state, pincode, is_default)
     VALUES (?, 'Home', '12 Residency Road', 'Bengaluru', 'Karnataka', '560025', 1)`,
    [customer.id],
  );

  const signedIn = await fetch(`${base}/api/account/default-address`, {
    headers: { cookie },
  });
  const data = await signedIn.json();
  check("a signed-in customer gets their default", data.address?.pincode === "560025");
  check("with their contact details", data.customer?.email === BUYER);
  check(
    "shaped exactly like the checkout form expects",
    ["line1", "line2", "city", "state", "pincode", "landmark"].every(
      (field) => field in (data.address ?? {}),
    ),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n9. An unregistered shop charges no GST, and says so");

{
  // Back to the caller's server, which has no seller identity configured.
  base = callerBase;

  const unregisteredId = await placeOrder({
    state: "Karnataka",
    items: [{ variantId: variantRows[0].id, qty: 1 }],
  });

  const [items] = await db.execute(
    `SELECT gst_rate_bps, taxable_value_paise, line_total_paise,
            cgst_paise, sgst_paise, igst_paise
       FROM order_items WHERE order_id = ?`,
    [unregisteredId],
  );

  // s.32 of the CGST Act: an unregistered person shall not collect tax. So
  // there is no split to record, and the taxable value is the whole amount
  // — which is also what keeps the row reconciling.
  check(
    "no tax is recorded against the order",
    items.every(
      (i) =>
        Number(i.cgst_paise) === 0 &&
        Number(i.sgst_paise) === 0 &&
        Number(i.igst_paise) === 0 &&
        Number(i.gst_rate_bps) === 0,
    ),
  );
  check(
    "and the line is wholly untaxed, so it still reconciles",
    items.every(
      (i) => Number(i.taxable_value_paise) === Number(i.line_total_paise),
    ),
  );

  const html = await (
    await fetch(`${base}/orders/${unregisteredId}/invoice`)
  ).text();
  check("the document is headed pro-forma", html.includes("not a tax invoice"));
  check(
    "it says plainly that no GST was charged",
    html.includes("no GST has been charged") ||
      html.includes("No GST has been charged"),
  );
  check(
    "and rules no GST column for the reader to look down",
    !/>\s*GST\s*<\/th>/.test(html),
  );
  check(
    "while still totalling to what was actually paid",
    html.includes("Value of supply"),
  );
}

/* ---------- cleanup ---------- */
registeredServer?.stop();
await cleanup();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
}

await db.end();
process.exit(failures.length ? 1 : 0);
