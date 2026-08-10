/**
 * Coupons, reviews and the newsletter (M13).
 *
 *   node scripts/test-promotions.mjs [port]
 *
 * The assertions that matter most here are the arithmetic ones.
 *
 * A discount on a GST-inclusive price is not a subtraction from the total.
 * Section 15(3)(a) of the CGST Act excludes a discount given at the time of
 * supply from the transaction value, so the tax has to be recomputed from
 * the discounted figure — per line, with the shares summing to the order
 * discount exactly. Get that wrong and every invoice with a voucher on it
 * over-declares output tax while still *looking* right, because the total
 * the customer paid is unaffected. So the checks below reconcile the line
 * rows, not the total.
 *
 * Section 4 spawns its own server with a seller identity, exactly as
 * test-commerce.mjs does, so the tax split is exercised end to end without
 * a fabricated GSTIN ever reaching a config file.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

loadEnv();

const port = process.argv[2] ?? "3100";
const callerBase = `http://localhost:${port}`;

const REGISTERED_SELLER = {
  SELLER_LEGAL_NAME: "Ekmool Test Foods Private Limited",
  SELLER_GSTIN: "29AABCE1234F1Z5",
  SELLER_STATE: "Karnataka",
  SELLER_ADDRESS: "12 Residency Road, Bengaluru, Karnataka 560025",
  SELLER_FSSAI: "10012345678901",
};

let base = callerBase;
let registeredServer = null;

const BUYER = "promo-test@example.com";
const OTHER = "promo-other@example.com";
const CODES = ["PROMOPCT", "PROMOFLAT", "PROMOSHIP", "PROMOONCE", "PROMODEAD", "PROMOMIN"];

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
  // apps/web, not the repository root: outputFileTracingRoot points file
  // tracing at the workspace, so the standalone tree carries the hoisted
  // node_modules at its top and the server one level down under apps/web.
  const entry = ".next/standalone/apps/web/server.js";
  if (!existsSync(entry)) {
    throw new Error(
      `${entry} is missing — run \`pnpm --filter web build && pnpm --filter web standalone\` first.`,
    );
  }

  const serverPort = String(Number(port) + 2);
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
  process.on("exit", () => child.kill());

  console.log(`  (registered seller server on ${url})`);
  return { url, stop: () => child.kill() };
}

function post(path, body, headers = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const [variants] = await db.execute(
  `SELECT v.id, v.price_inr FROM product_variants v
    JOIN products p ON p.id = v.product_id
   WHERE v.is_active = 1 ORDER BY v.id LIMIT 3`,
);

/** Places an order and returns { status, body }. */
async function placeOrder({ items, couponCode, email = BUYER, key }) {
  const response = await post(
    "/api/checkout",
    {
      customer: { name: "Promo Tester", email, phone: "9876543210" },
      address: {
        line1: "12 Residency Road",
        line2: "",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560025",
        landmark: "",
      },
      paymentMethod: "cod",
      items,
      notes: "",
      ...(couponCode ? { couponCode } : {}),
    },
    { "idempotency-key": key ?? `promo-${Math.random().toString(36).slice(2)}` },
  );
  return { status: response.status, body: await response.json() };
}

async function seedCoupons() {
  await db.execute(
    `DELETE FROM coupon_redemptions WHERE coupon_id IN
       (SELECT id FROM coupons WHERE code IN (?, ?, ?, ?, ?, ?))`,
    CODES,
  );
  await db.execute(`DELETE FROM coupons WHERE code IN (?, ?, ?, ?, ?, ?)`, CODES);

  const rows = [
    // 10% off, capped at ₹50
    ["PROMOPCT", "10% off", "percent", 1000, null, 5000, 0, null, null, 10],
    // ₹75 flat
    ["PROMOFLAT", "Flat 75 off", "flat", null, 7500, null, 0, null, null, 10],
    // Free shipping
    ["PROMOSHIP", "Delivery on us", "free_shipping", null, null, null, 0, null, null, 10],
    // One use in total
    ["PROMOONCE", "First one only", "flat", null, 1000, null, 0, null, 1, 10],
    // Expired yesterday
    ["PROMODEAD", "Expired", "flat", null, 1000, null, 0, "past", null, 10],
    // Needs a big basket
    ["PROMOMIN", "Big baskets", "flat", null, 1000, null, 9_999_00, null, null, 10],
  ];

  for (const [
    code, description, kind, percentBps, amountPaise, maxDiscount,
    minSubtotal, ends, globalLimit, perCustomer,
  ] of rows) {
    await db.execute(
      `INSERT INTO coupons
         (code, description, kind, percent_bps, amount_paise,
          max_discount_paise, min_subtotal_paise, ends_at,
          global_limit, per_customer_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${ends === "past" ? "NOW() - INTERVAL 1 DAY" : "NULL"}, ?, ?)`,
      [code, description, kind, percentBps, amountPaise, maxDiscount, minSubtotal, globalLimit, perCustomer],
    );
  }
}

async function cleanup() {
  for (const email of [BUYER, OTHER]) {
    const [held] = await db.execute(
      `SELECT i.variant_id v, i.qty q
         FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.customer_email = ? AND o.status <> 'cancelled'
          AND i.variant_id IS NOT NULL`,
      [email],
    );
    for (const row of held) {
      await db.execute(
        "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
        [row.q, row.v],
      );
    }
    await db.execute(
      `DELETE r FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id
        WHERE o.customer_email = ?`,
      [email],
    );
    await db.execute("DELETE FROM reviews WHERE customer_email = ?", [email]);
    await db.execute(
      `DELETE l FROM email_log l JOIN orders o ON o.id = l.order_id
        WHERE o.customer_email = ?`,
      [email],
    );
    await db.execute("DELETE FROM orders WHERE customer_email = ?", [email]);
    await db.execute("DELETE FROM customers WHERE email = ?", [email]);
    await db.execute("DELETE FROM newsletter_subscribers WHERE email = ?", [email]);
  }
  await db.execute(
    `DELETE FROM coupon_redemptions WHERE coupon_id IN
       (SELECT id FROM coupons WHERE code IN (?, ?, ?, ?, ?, ?))`,
    CODES,
  );
  await db.execute(`DELETE FROM coupons WHERE code IN (?, ?, ?, ?, ?, ?)`, CODES);
}

/**
 * Deleting review rows does not un-render the pages built from them. A
 * previous run's published review survives in the ISR cache, and section 7
 * then fails asserting that an unpublished review is nowhere on the page —
 * because what it is reading is last run's page. Purge at both ends so the
 * suite starts and finishes from a known cache state.
 */
async function purgeCaches() {
  await fetch(`${callerBase}/api/revalidate`, {
    method: "POST",
    headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" },
  }).catch(() => {});
}

/**
 * A product page that actually reflects the database.
 *
 * `revalidateTag` marks a page stale; it does not rebuild it. The next
 * request still receives the previous copy while regeneration runs behind
 * it — measured here, it takes **two** requests before the third carries
 * the new content. That is stale-while-revalidate doing its job, and it is
 * the behaviour that stops a shopper ever seeing a blank page, so the test
 * accommodates it rather than the other way round.
 *
 * This matters for the negative assertions as much as the positive ones: a
 * stale page can still be showing a review from a previous run, and
 * asserting its absence against a stale copy proves nothing.
 */
async function freshPage(slug) {
  await purgeCaches();
  let html = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    html = await (await fetch(`${callerBase}/products/${slug}`)).text();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return html;
}

console.log(`Promotions tests against ${callerBase}\n`);
await cleanup();
await purgeCaches();
await seedCoupons();

/* ------------------------------------------------------------------ */
console.log("1. A code is quoted before it is committed to");

{
  const item = { variantId: variants[0].id, qty: 2 };
  const subtotal = variants[0].price_inr * 2;

  const quote = await (
    await post("/api/coupons/preview", { code: "PROMOPCT", items: [item] })
  ).json();

  check("a valid code returns what it is worth", quote.code === "COUPON_OK");
  check(
    "10% of the basket, capped at the cap",
    quote.goodsDiscountPaise === Math.min(Math.floor(subtotal * 0.1), 5000),
    `${quote.goodsDiscountPaise} from ${subtotal}`,
  );

  const unknown = await (
    await post("/api/coupons/preview", { code: "NOSUCHCODE", items: [item] })
  ).json();
  check("an unknown code is refused", unknown.code === "COUPON_REFUSED");
  check(
    "and an unknown code reads the same as a switched-off one, so codes cannot be probed",
    unknown.error === "That code is not valid.",
    unknown.error,
  );

  const dead = await (
    await post("/api/coupons/preview", { code: "PROMODEAD", items: [item] })
  ).json();
  check("an expired code says so", dead.reason === "expired", dead.reason);

  const min = await (
    await post("/api/coupons/preview", { code: "PROMOMIN", items: [item] })
  ).json();
  check(
    "a code below its minimum names the minimum",
    min.reason === "below_minimum" && /₹/.test(min.error),
    min.error,
  );

  // The client must not be able to name its own subtotal.
  const lied = await (
    await post("/api/coupons/preview", {
      code: "PROMOMIN",
      items: [{ variantId: variants[0].id, qty: 1 }],
      subtotalPaise: 99_999_00,
    })
  ).json();
  check(
    "a subtotal in the request body is ignored",
    lied.reason === "below_minimum",
    lied.reason,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n2. The discount reaches the order, and the parts sum to the whole");

{
  const items = [
    { variantId: variants[0].id, qty: 2 },
    { variantId: variants[1].id, qty: 1 },
  ];
  const placed = await placeOrder({ items, couponCode: "PROMOFLAT" });
  check("an order with a code is accepted", placed.status === 201, JSON.stringify(placed.body));

  const [orders] = await db.execute(
    `SELECT subtotal_paise, discount_paise, shipping_paise, total_paise, coupon_code
       FROM orders WHERE id = ?`,
    [placed.body.orderId],
  );
  const order = orders[0];

  check("the code is recorded on the order", order.coupon_code === "PROMOFLAT");
  check(
    "the discount is the coupon's amount",
    order.discount_paise === 7500,
    String(order.discount_paise),
  );
  check(
    "and the total is subtotal minus discount plus shipping",
    order.total_paise ===
      order.subtotal_paise - order.discount_paise + order.shipping_paise,
    `${order.subtotal_paise} - ${order.discount_paise} + ${order.shipping_paise} != ${order.total_paise}`,
  );

  const [lines] = await db.execute(
    `SELECT line_total_paise, discount_paise, taxable_value_paise
       FROM order_items WHERE order_id = ? ORDER BY id`,
    [placed.body.orderId],
  );

  const shareSum = lines.reduce((sum, row) => sum + row.discount_paise, 0);
  check(
    "the per-line shares sum to the order discount exactly",
    shareSum === order.discount_paise,
    `${shareSum} vs ${order.discount_paise}`,
  );
  check(
    "no line is discounted below zero",
    lines.every((row) => row.discount_paise <= row.line_total_paise),
  );

  const [redemptions] = await db.execute(
    `SELECT discount_paise FROM coupon_redemptions WHERE order_id = ?`,
    [placed.body.orderId],
  );
  check(
    "the redemption is recorded against the order",
    redemptions.length === 1 && redemptions[0].discount_paise === 7500,
    JSON.stringify(redemptions),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n3. Free shipping waives the charge rather than discounting goods");

{
  // A single cheap unit, so the basket is under the free-shipping threshold
  // and there is actually a shipping charge to waive.
  const items = [{ variantId: variants[0].id, qty: 1 }];
  const placed = await placeOrder({ items, couponCode: "PROMOSHIP" });

  const [orders] = await db.execute(
    `SELECT subtotal_paise, discount_paise, shipping_paise, total_paise
       FROM orders WHERE id = ?`,
    [placed.body.orderId],
  );
  const order = orders[0];

  check("shipping is zero", order.shipping_paise === 0, String(order.shipping_paise));
  check(
    "and nothing came off the goods, so the taxable value is untouched",
    order.discount_paise === 0,
    String(order.discount_paise),
  );
  check(
    "the total is the goods alone",
    order.total_paise === order.subtotal_paise,
    `${order.total_paise} vs ${order.subtotal_paise}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n4. GST is taken from the discounted figure, not the list price");

registeredServer = await startRegisteredServer();
base = registeredServer.url;

{
  const items = [
    { variantId: variants[0].id, qty: 3 },
    { variantId: variants[1].id, qty: 2 },
  ];
  const placed = await placeOrder({ items, couponCode: "PROMOFLAT" });
  check("a discounted order is placed against a registered seller", placed.status === 201);

  const [lines] = await db.execute(
    `SELECT line_total_paise, discount_paise, taxable_value_paise,
            cgst_paise, sgst_paise, igst_paise, gst_rate_bps
       FROM order_items WHERE order_id = ? ORDER BY id`,
    [placed.body.orderId],
  );

  check("tax was actually applied", lines.every((row) => row.gst_rate_bps > 0));

  const reconciles = lines.every((row) => {
    const net = row.line_total_paise - row.discount_paise;
    const tax = row.cgst_paise + row.sgst_paise + row.igst_paise;
    return row.taxable_value_paise + tax === net;
  });
  check(
    "taxable + tax equals the discounted line, to the paise",
    reconciles,
    JSON.stringify(lines),
  );

  // The defect this whole test exists for: taxing the list price would
  // leave taxable + tax equal to line_total, not to the discounted figure.
  const taxedListPrice = lines.some((row) => {
    const tax = row.cgst_paise + row.sgst_paise + row.igst_paise;
    return (
      row.discount_paise > 0 &&
      row.taxable_value_paise + tax === row.line_total_paise
    );
  });
  check("no line was taxed on its undiscounted total", !taxedListPrice);

  const [orders] = await db.execute(
    `SELECT subtotal_paise, discount_paise, shipping_paise, total_paise
       FROM orders WHERE id = ?`,
    [placed.body.orderId],
  );
  const order = orders[0];
  const lineNet = lines.reduce(
    (sum, row) => sum + row.line_total_paise - row.discount_paise,
    0,
  );
  check(
    "the invoice's line values add up to what was charged",
    lineNet + order.shipping_paise === order.total_paise,
    `${lineNet} + ${order.shipping_paise} != ${order.total_paise}`,
  );

  const invoice = await (
    await fetch(`${base}/orders/${placed.body.orderId}/invoice`)
  ).text();
  check("the invoice renders", invoice.includes("Tax Invoice") || invoice.includes("Invoice"));
  check("and shows the discount", invoice.includes("PROMOFLAT"));
}

base = callerBase;
registeredServer.stop();
registeredServer = null;

/* ------------------------------------------------------------------ */
console.log("\n5. Caps hold, including under concurrency");

{
  const items = [{ variantId: variants[0].id, qty: 1 }];

  // Ten simultaneous attempts at a coupon with a global limit of one.
  const attempts = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      placeOrder({
        items,
        couponCode: "PROMOONCE",
        email: `promo-race-${index}@example.com`,
        key: `promo-race-${index}-${Date.now()}`,
      }),
    ),
  );

  const accepted = attempts.filter((a) => a.status === 201);
  // Ten at once is also the whole checkout rate-limit bucket, so some of
  // these are 429s. That is the limiter working, not a coupon result, and
  // counting them as refusals would make this assertion test the wrong thing.
  const throttled = attempts.filter((a) => a.status === 429);
  const decided = attempts.filter((a) => a.status !== 429 && a.status !== 201);

  check(
    "exactly one order claimed the single use",
    accepted.length === 1,
    `${accepted.length} accepted, ${throttled.length} throttled`,
  );
  check(
    "and every other attempt that reached the coupon was refused, not charged full price",
    decided.length > 0 && decided.every((a) => a.body?.code === "COUPON_REFUSED"),
    decided.map((a) => `${a.status}:${a.body?.code}`).join(", "),
  );

  const [used] = await db.execute(
    `SELECT times_used FROM coupons WHERE code = 'PROMOONCE'`,
  );
  check(
    "the counter matches the redemptions",
    Number(used[0].times_used) === 1,
    String(used[0].times_used),
  );

  // A refused coupon must roll the whole order back, stock included.
  const [strays] = await db.execute(
    `SELECT COUNT(*) n FROM orders WHERE customer_email LIKE 'promo-race-%'`,
  );
  check(
    "no order row survives a refusal",
    Number(strays[0].n) === accepted.length,
    `${strays[0].n} orders for ${accepted.length} acceptances`,
  );

  // Tidy the race orders before the per-customer check reuses BUYER.
  const [raceHeld] = await db.execute(
    `SELECT i.variant_id v, i.qty q FROM order_items i
       JOIN orders o ON o.id = i.order_id
      WHERE o.customer_email LIKE 'promo-race-%' AND i.variant_id IS NOT NULL`,
  );
  for (const row of raceHeld) {
    await db.execute(
      "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
      [row.q, row.v],
    );
  }
  await db.execute(
    `DELETE r FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id
      WHERE o.customer_email LIKE 'promo-race-%'`,
  );
  await db.execute(
    `DELETE l FROM email_log l JOIN orders o ON o.id = l.order_id
      WHERE o.customer_email LIKE 'promo-race-%'`,
  );
  await db.execute(`DELETE FROM orders WHERE customer_email LIKE 'promo-race-%'`);
  await db.execute(`DELETE FROM customers WHERE email LIKE 'promo-race-%'`);
}

/* ------------------------------------------------------------------ */
console.log("\n6. Per-customer caps");

{
  // Section 5 fired ten checkouts from one IP, which is the whole 10/min
  // bucket. Waiting is the test's problem, not the shop's — the limiter
  // doing exactly what it is for is a pass, not a failure.
  process.stdout.write("  (waiting for the checkout rate limit to refill)\n");
  await new Promise((resolve) => setTimeout(resolve, 70_000));

  const items = [{ variantId: variants[0].id, qty: 1 }];

  // PROMOSHIP allows 10 per customer; PROMOFLAT was already used once by
  // BUYER in section 2, so drop its per-customer limit to 1 and retry.
  await db.execute(
    `UPDATE coupons SET per_customer_limit = 1 WHERE code = 'PROMOFLAT'`,
  );

  const second = await placeOrder({ items, couponCode: "PROMOFLAT" });
  check(
    "a second use by the same customer is refused",
    second.body?.reason === "already_used",
    `${second.status} ${JSON.stringify(second.body?.reason)}`,
  );

  const other = await placeOrder({
    items,
    couponCode: "PROMOFLAT",
    email: OTHER,
  });
  check(
    "but a different customer may still use it",
    other.status === 201,
    `${other.status} ${JSON.stringify(other.body)}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n7. Reviews come only from delivered orders");

let sessionCookie = null;

{
  const guest = await post("/api/reviews", {
    productSlug: "mithila-makhana",
    rating: 5,
    title: "Excellent",
    body: "This is a long enough body to pass validation comfortably.",
  });
  check("a stranger cannot post a review", guest.status === 401, `got ${guest.status}`);

  // BUYER has orders from earlier sections, none of them delivered yet.
  const [orders] = await db.execute(
    `SELECT id FROM orders WHERE customer_email = ? ORDER BY created_at LIMIT 1`,
    [BUYER],
  );
  const orderId = orders[0].id;

  const lookup = await post("/api/account/lookup", {
    reference: String(orderId).slice(-8),
    email: BUYER,
  });
  sessionCookie = (lookup.headers.get("set-cookie") ?? "").split(";")[0];
  check("the buyer can hold a session", lookup.status === 200);

  const [slugRows] = await db.execute(
    `SELECT product_slug FROM order_items WHERE order_id = ? LIMIT 1`,
    [orderId],
  );
  const slug = slugRows[0].product_slug;

  const undelivered = await fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({
      productSlug: slug,
      rating: 5,
      title: "Excellent",
      body: "This is a long enough body to pass validation comfortably.",
    }),
  });
  check(
    "an order that has not arrived earns no review",
    undelivered.status === 403,
    `got ${undelivered.status}`,
  );

  // Deliver it, and try again.
  await db.execute(
    `UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = ?`,
    [orderId],
  );

  const delivered = await fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({
      productSlug: slug,
      rating: 4,
      title: "Good colour, strong smell",
      body: "Used it in dal and in a marinade. Noticeably brighter than the supermarket tin I usually buy.",
    }),
  });
  check("a delivered order earns one", delivered.status === 201, `got ${delivered.status}`);

  const again = await fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({
      productSlug: slug,
      rating: 1,
      title: "Changed my mind",
      body: "A second review from the same order should not be accepted at all.",
    }),
  });
  check("but only one", again.status === 409, `got ${again.status}`);

  const [stored] = await db.execute(
    `SELECT status, display_name, rating FROM reviews WHERE customer_email = ?`,
    [BUYER],
  );
  check("it lands unpublished", stored[0]?.status === "pending", stored[0]?.status);
  check(
    "with a byline, not a full name",
    stored[0]?.display_name === "Promo T.",
    stored[0]?.display_name,
  );

  const page = await freshPage(slug);
  check(
    "an unpublished review is nowhere on the product page",
    !page.includes("Good colour, strong smell"),
  );
  check(
    "and no rating is invented in the meantime",
    !page.includes("aggregateRating"),
  );
  check(
    "the page says so plainly rather than showing a zero",
    page.includes("Nobody has reviewed this yet"),
  );

  // Publish it, and it appears.
  await db.execute(
    `UPDATE reviews SET status = 'published', published_at = NOW()
      WHERE customer_email = ?`,
    [BUYER],
  );

  const republished = await freshPage(slug);
  check(
    "a published review shows on the product page",
    republished.includes("Good colour, strong smell"),
  );
  check(
    "and only then does AggregateRating appear",
    republished.includes("aggregateRating"),
  );
  check(
    "with the count that is actually on the page",
    /"reviewCount":\s*1/.test(republished),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n8. The newsletter needs a second click");

{
  const form = new URLSearchParams({ email: BUYER });
  const response = await fetch(`${base}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    redirect: "manual",
  });

  check(
    "the form posts and redirects, with no JavaScript involved",
    response.status === 303,
    `got ${response.status}`,
  );

  const [rows] = await db.execute(
    `SELECT status, token_hash FROM newsletter_subscribers WHERE email = ?`,
    [BUYER],
  );
  check("a row exists", rows.length === 1);
  check(
    "but it is pending, not subscribed",
    rows[0]?.status === "pending",
    rows[0]?.status,
  );
  check(
    "and the token is stored hashed, never in the clear",
    /^[0-9a-f]{64}$/.test(rows[0]?.token_hash ?? ""),
  );

  // Confirming needs the raw token, which only the email holds — so read
  // the log the mail provider wrote instead of the database.
  const [logged] = await db.execute(
    `SELECT COUNT(*) n FROM email_log WHERE template = 'newsletter_confirm'
       AND recipient = ?`,
    [BUYER],
  );
  check(
    "exactly one confirmation request was logged",
    Number(logged[0].n) === 1,
    String(logged[0].n),
  );

  const badToken = await fetch(`${base}/newsletter/confirm?token=${"0".repeat(64)}`);
  const badHtml = await badToken.text();
  check(
    "an unknown token confirms nothing",
    badHtml.includes("expired"),
  );

  const [stillPending] = await db.execute(
    `SELECT status FROM newsletter_subscribers WHERE email = ?`,
    [BUYER],
  );
  check(
    "and the row is untouched by it",
    stillPending[0]?.status === "pending",
    stillPending[0]?.status,
  );

  // Now confirm properly, using a token we set ourselves.
  const raw = "a".repeat(64);
  const { createHash } = await import("node:crypto");
  await db.execute(
    `UPDATE newsletter_subscribers SET token_hash = ? WHERE email = ?`,
    [createHash("sha256").update(raw, "utf8").digest("hex"), BUYER],
  );

  await fetch(`${base}/newsletter/confirm?token=${raw}`);
  const [confirmed] = await db.execute(
    `SELECT status, confirmed_at FROM newsletter_subscribers WHERE email = ?`,
    [BUYER],
  );
  check("a real token confirms", confirmed[0]?.status === "confirmed");
  check("and stamps when", confirmed[0]?.confirmed_at !== null);

  // Re-subscribing an already-confirmed address must not re-send.
  await fetch(`${base}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: BUYER }),
    redirect: "manual",
  });
  const [afterRepeat] = await db.execute(
    `SELECT COUNT(*) n FROM email_log WHERE template = 'newsletter_confirm'
       AND recipient = ?`,
    [BUYER],
  );
  check(
    "a repeat sign-up of a confirmed address sends nothing",
    Number(afterRepeat[0].n) === 1,
    String(afterRepeat[0].n),
  );

  await fetch(`${base}/newsletter/unsubscribe?token=${raw}`);
  const [gone] = await db.execute(
    `SELECT status FROM newsletter_subscribers WHERE email = ?`,
    [BUYER],
  );
  check(
    "one click unsubscribes, with no login and no confirmation step",
    gone[0]?.status === "unsubscribed",
    gone[0]?.status,
  );

  const trap = await fetch(`${base}/api/newsletter/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: OTHER, company_website: "https://spam.example" }),
    redirect: "manual",
  });
  check("a filled honeypot looks successful", trap.status === 303);
  const [trapped] = await db.execute(
    `SELECT COUNT(*) n FROM newsletter_subscribers WHERE email = ?`,
    [OTHER],
  );
  check("but writes nothing", Number(trapped[0].n) === 0, String(trapped[0].n));
}

/* ------------------------------------------------------------------ */
console.log("\n9. Share cards are real images, one per product");

{
  const response = await fetch(
    `${base}/products/mithila-makhana/opengraph-image`,
  );
  check("the card is served", response.status === 200, `got ${response.status}`);
  check(
    "as a PNG",
    (response.headers.get("content-type") ?? "").includes("image/png"),
    response.headers.get("content-type") ?? "",
  );

  const bytes = Buffer.from(await response.arrayBuffer());
  check("with real image bytes", bytes.length > 5000, `${bytes.length} bytes`);
  check(
    "and a PNG signature rather than an error page",
    bytes.subarray(0, 4).toString("hex") === "89504e47",
  );

  const other = await fetch(
    `${base}/products/guntur-chilli-powder/opengraph-image`,
  );
  const otherBytes = Buffer.from(await other.arrayBuffer());
  check(
    "each product gets its own card, not one shared logo",
    !bytes.equals(otherBytes),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n10. The new data answers a privacy request");

if (sessionCookie) {
  const exported = await (
    await fetch(`${base}/api/account/export`, {
      headers: { cookie: sessionCookie },
    })
  ).json();

  check(
    "reviews appear in an export",
    Array.isArray(exported.reviews) && exported.reviews.length === 1,
    JSON.stringify(exported.reviews?.length),
  );
  check(
    "so does the newsletter status",
    exported.newsletter?.status === "unsubscribed",
    JSON.stringify(exported.newsletter),
  );
  check(
    "and the export carries no live token",
    !JSON.stringify(exported).includes("token"),
  );

  const erased = await (
    await fetch(`${base}/api/account/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ confirm: "ERASE" }),
    })
  ).json();

  check("erasure removes the review", erased.reviewsDeleted === 1, String(erased.reviewsDeleted));
  check(
    "and the newsletter row",
    erased.newsletterDeleted === 1,
    String(erased.newsletterDeleted),
  );

  const [redemption] = await db.execute(
    `SELECT customer_email FROM coupon_redemptions
      WHERE customer_email LIKE 'erased+%' LIMIT 1`,
  );
  check(
    "a coupon redemption is anonymised rather than deleted, so the order still reconciles",
    redemption.length === 1,
    JSON.stringify(redemption),
  );
}

/* ---------- cleanup ---------- */
registeredServer?.stop();
await db.execute(
  `UPDATE orders SET customer_email = 'erased-cleanup@example.com'
    WHERE customer_email LIKE 'erased+%'`,
);
await db.execute(
  `DELETE r FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id
    WHERE o.customer_email = 'erased-cleanup@example.com'`,
);
await db.execute(
  `DELETE l FROM email_log l JOIN orders o ON o.id = l.order_id
    WHERE o.customer_email = 'erased-cleanup@example.com'`,
);
await db.execute(
  `SELECT 1`,
);
{
  const [held] = await db.execute(
    `SELECT i.variant_id v, i.qty q FROM order_items i
       JOIN orders o ON o.id = i.order_id
      WHERE o.customer_email = 'erased-cleanup@example.com'
        AND o.status <> 'cancelled' AND i.variant_id IS NOT NULL`,
  );
  for (const row of held) {
    await db.execute(
      "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
      [row.q, row.v],
    );
  }
  await db.execute(
    `DELETE FROM orders WHERE customer_email = 'erased-cleanup@example.com'`,
  );
}
await db.execute("DELETE FROM email_log WHERE recipient IN (?, ?)", [BUYER, OTHER]);
await cleanup();

// Not just purge — *warm*. Leaving the pages merely marked stale hands the
// next reader a cached copy still showing this suite's review, and the
// next reader is usually validate:schema, which then fails on structured
// data for a review that no longer exists. A test that leaves the site in
// a state its own assertions would reject has not finished.
await freshPage("kandhamal-turmeric-powder");
await db.end();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
}

process.exit(failures.length ? 1 : 0);
