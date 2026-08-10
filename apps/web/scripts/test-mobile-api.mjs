/**
 * The mobile API surface (Phase 2). Runs against a live server + DB.
 *
 *   node scripts/test-mobile-api.mjs [port]
 *
 * The properties asserted here are the ones a naive implementation gets
 * wrong, which is the only kind worth a test:
 *
 *   - the three catalogue documents are STATIC — they serve with MySQL
 *     stopped (asserted in test:db-down, which is where the database can
 *     actually be stopped) and they carry a body-derived ETag
 *   - purging the catalogue does not purge reviews, and vice versa. A
 *     single combined document would pass every other test in this file
 *     and fail this one
 *   - /api/v1/session is byte-identical on a wrong reference and a wrong
 *     email. A different failure for each is an oracle
 *   - a bearer token reads exactly what the cookie reads, and nothing that
 *     belongs to anyone else
 *   - two install ids behind one IP do not take each other's rate-limit
 *     tokens; one install id repeating still gets stopped
 *   - no new endpoint hands a native client a cookie
 *
 * Rate limiting is keyed per IP and several buckets here are small, so the
 * suite spends its budget deliberately and in a fixed order.
 */
import mysql from "mysql2/promise";
import { createHmac } from "node:crypto";
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

const BUYER = "mobile-test@example.com";
const OTHER = "mobile-other@example.com";

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

/** 32 hex characters, the shape the server accepts. */
function installId(seed) {
  return createHmac("sha256", "mobile-suite").update(seed).digest("hex").slice(0, 32);
}

function post(path, body, headers = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function cleanup() {
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
  await db.execute(
    `DELETE l FROM email_log l JOIN orders o ON o.id = l.order_id
      WHERE o.customer_email IN (?, ?)`,
    [BUYER, OTHER],
  );
  await db.execute("DELETE FROM orders WHERE customer_email IN (?, ?)", [BUYER, OTHER]);
  await db.execute("DELETE FROM customers WHERE email IN (?, ?)", [BUYER, OTHER]);
}

/** One COD order, placed the way a customer would. */
async function placeOrder(variantId, email) {
  const response = await post(
    "/api/checkout",
    {
      customer: { name: "Mobile Tester", email, phone: "9876543210" },
      address: {
        line1: "12 Residency Road",
        line2: "",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560025",
        landmark: "",
      },
      paymentMethod: "cod",
      items: [{ variantId, qty: 1 }],
      notes: "",
    },
    { "idempotency-key": `mob-${email}-${Date.now()}-${Math.random()}` },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`checkout failed (${response.status}): ${JSON.stringify(data)}`);
  }
  return data.orderId;
}

async function purge(kind) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const response = await fetch(`${base}/api/revalidate?fanout=1&kind=${kind}`, {
    method: "POST",
    headers: { "x-revalidate-secret": secret },
  });
  if (!response.ok) {
    throw new Error(`revalidate ${kind} failed: ${response.status}`);
  }
  // The tag is marked stale; the next request regenerates. Ask for the
  // document once and throw the answer away so the ETag compared below is
  // the regenerated one rather than the stale copy still being served.
  return response;
}

async function etagOf(path) {
  const response = await fetch(`${base}${path}`);
  return { status: response.status, etag: response.headers.get("etag") };
}

await cleanup();

const [variantRows] = await db.execute(
  "SELECT id, product_id, price_inr FROM product_variants ORDER BY id LIMIT 1",
);
const variant = variantRows[0];

console.log(`\nRunning mobile API tests against ${base}\n`);

/* ------------------------------------------------------------------ */
console.log("1. The catalogue documents");

let catalogEtag = null;
{
  const response = await fetch(`${base}/catalog/v1.json`);
  check("/catalog/v1.json → 200", response.status === 200, `got ${response.status}`);
  check(
    "served as JSON",
    (response.headers.get("content-type") ?? "").includes("application/json"),
    response.headers.get("content-type") ?? "none",
  );

  catalogEtag = response.headers.get("etag");
  check("carries an ETag", typeof catalogEtag === "string" && catalogEtag.length > 2);

  const doc = await response.json();
  check("version is 1", doc.version === 1);
  check("generatedAt is an ISO timestamp", !Number.isNaN(Date.parse(doc.generatedAt ?? "")));
  check("all five products are present", Array.isArray(doc.products) && doc.products.length === 5,
    `${doc.products?.length} products`);

  const product = doc.products?.[0] ?? {};
  check("a product carries its slug and origin", Boolean(product.slug && product.originState));
  check(
    "prices are integer paise",
    Number.isInteger(product.variants?.[0]?.pricePaise),
    JSON.stringify(product.variants?.[0]?.pricePaise),
  );

  // Rule 5. The surest way to fabricate social proof is to invent a
  // ranking field in a document nobody reviews.
  const serialised = JSON.stringify(doc);
  for (const forbidden of ["bestseller", "popular", "trending", "rating", "reviewCount"]) {
    check(`nothing derived: no "${forbidden}" field`, !serialised.includes(`"${forbidden}"`));
  }
}

{
  const response = await fetch(`${base}/catalog/reviews-v1.json`);
  check("/catalog/reviews-v1.json → 200", response.status === 200, `got ${response.status}`);
  const doc = await response.json();
  check("reviews are keyed by product slug", typeof doc.products === "object" && doc.products !== null);

  const serialised = JSON.stringify(doc);
  // A published review carries a display name, never the address it was
  // submitted from, and never the order that entitled it.
  check("no customer email leaks into the reviews document", !/@/.test(serialised.replace(/"generatedAt":"[^"]*"/, "")));
  check("no order id leaks into the reviews document", !serialised.includes("orderId"));

  const entries = Object.values(doc.products ?? {});
  check(
    "an unreviewed product has rating null, not zero",
    entries.every((entry) => entry.rating === null || entry.rating.count > 0),
  );
}

{
  const response = await fetch(`${base}/catalog/content-v1.json`);
  check("/catalog/content-v1.json → 200", response.status === 200, `got ${response.status}`);
  const doc = await response.json();
  check(
    "content values are present",
    doc.values && Object.keys(doc.values).length > 20,
    `${Object.keys(doc.values ?? {}).length} keys`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n2. The ETag is stable, and the tags are separate");

{
  const first = await etagOf("/catalog/v1.json");
  const second = await etagOf("/catalog/v1.json");
  check(
    "an unchanged catalogue keeps the same ETag",
    first.etag !== null && first.etag === second.etag,
    `${first.etag} then ${second.etag}`,
  );

  const conditional = await fetch(`${base}/catalog/v1.json`, {
    headers: { "if-none-match": first.etag ?? "" },
  });
  // 304 is the goal and 200 is acceptable: honouring If-None-Match inside
  // a force-static handler would opt the route into dynamic rendering,
  // which costs the property the whole phase exists to protect. If this
  // reports 200 the CDN is expected to do it instead — see the route.
  console.log(
    `  NOTE  If-None-Match → ${conditional.status}` +
      (conditional.status === 304 ? " (handled in the route)" : " (left to the CDN)"),
  );

  const reviewsBefore = await etagOf("/catalog/reviews-v1.json");
  const contentBefore = await etagOf("/catalog/content-v1.json");

  // Change a real catalogue value, purge only the products tag, and check
  // that exactly one document moved. This is the assertion a single
  // combined document fails and everything else in this file passes.
  const originalPrice = Number(variant.price_inr);
  await db.execute("UPDATE product_variants SET price_inr = ? WHERE id = ?", [
    originalPrice + 100,
    variant.id,
  ]);
  await purge("catalog");
  await sleep(1500);
  await fetch(`${base}/catalog/v1.json`);
  await sleep(500);

  const catalogAfter = await etagOf("/catalog/v1.json");
  const reviewsAfter = await etagOf("/catalog/reviews-v1.json");
  const contentAfter = await etagOf("/catalog/content-v1.json");

  check(
    "a catalogue change moves the catalogue ETag",
    catalogAfter.etag !== null && catalogAfter.etag !== first.etag,
    `${first.etag} then ${catalogAfter.etag}`,
  );
  check(
    "it does NOT move the reviews ETag",
    reviewsAfter.etag === reviewsBefore.etag,
    `${reviewsBefore.etag} then ${reviewsAfter.etag}`,
  );
  check(
    "it does NOT move the content ETag",
    contentAfter.etag === contentBefore.etag,
    `${contentBefore.etag} then ${contentAfter.etag}`,
  );

  await db.execute("UPDATE product_variants SET price_inr = ? WHERE id = ?", [
    originalPrice,
    variant.id,
  ]);
  await purge("catalog");
  await sleep(1500);
  await fetch(`${base}/catalog/v1.json`);
}

/* ------------------------------------------------------------------ */
console.log("\n3. /api/v1/bootstrap");

{
  const response = await fetch(`${base}/api/v1/bootstrap`);
  check("→ 200", response.status === 200, `got ${response.status}`);
  check(
    "is never cached",
    (response.headers.get("cache-control") ?? "").includes("no-store"),
    response.headers.get("cache-control") ?? "none",
  );

  const doc = await response.json();
  check("declares its version", doc.version === 1);
  check("reports whether Razorpay is configured", typeof doc.payments?.razorpay === "boolean");
  check("minClientBuild is an integer", Number.isInteger(doc.minClientBuild));
  check(
    "messageForOlderClients is a string or null",
    doc.messageForOlderClients === null || typeof doc.messageForOlderClients === "string",
  );

  // The degradation contract, checked against the server's own view rather
  // than against this process's environment: the suite may be run with a
  // different .env than the server was started with.
  const health = await (await fetch(`${base}/api/health`)).json();
  if (health.razorpay !== undefined) {
    check(
      "matches what the server reports elsewhere",
      doc.payments.razorpay === Boolean(health.razorpay),
    );
  }
}

/* ------------------------------------------------------------------ */
console.log("\n4. Bearer sessions");

const orderId = await placeOrder(variant.id, BUYER);
const reference = orderId.slice(-8).toUpperCase();
const otherOrderId = await placeOrder(variant.id, OTHER);

let token = null;
{
  const response = await post("/api/v1/session", { reference, email: BUYER });
  check("a correct reference and email mint a token", response.status === 200, `got ${response.status}`);

  const body = await response.json();
  token = body.token;
  check("the token is the signed session shape", typeof token === "string" && /^[\w-]+\.[0-9a-f]{64}$/.test(token));
  check("it reports the verified email", body.email === BUYER);
  check("it reports an expiry in epoch seconds", Number.isInteger(body.expiresAt) && body.expiresAt > 1_700_000_000);

  // The reason this endpoint may hand a token to a client at all is that
  // it only ever issues one against fresh proof. Handing one back in a
  // cookie as well would be a second door nobody asked for.
  check("it sets no cookie", (response.headers.getSetCookie?.() ?? []).length === 0);
  check("it is never cached", (response.headers.get("cache-control") ?? "").includes("no-store"));
}

{
  // Byte-identical, not merely both-404. A different message for a wrong
  // reference than for a wrong email tells a prober which references exist.
  const wrongEmail = await post("/api/v1/session", { reference, email: "nobody@example.com" });
  const wrongRef = await post("/api/v1/session", { reference: "ZZZZZZZZ", email: BUYER });

  const a = await wrongEmail.text();
  const b = await wrongRef.text();

  check("a wrong email is refused", wrongEmail.status === 404, `got ${wrongEmail.status}`);
  check("a wrong reference is refused with the same status", wrongRef.status === wrongEmail.status);
  check("…and a byte-identical body", a === b, `${a} vs ${b}`);
}

{
  const bearer = { authorization: `Bearer ${token}` };

  const mine = await fetch(`${base}/api/account/wishlist`, { headers: bearer });
  check("a bearer token is accepted where the cookie is", mine.status === 200, `got ${mine.status}`);

  const anonymous = await fetch(`${base}/api/account/wishlist`);
  check("…and no token is still refused", anonymous.status === 401, `got ${anonymous.status}`);

  // A token signed with a different secret must read nothing. Forged with
  // the right shape and the wrong key, which is the attack.
  const payload = token.split(".")[0];
  const forged = `${payload}.${createHmac("sha256", "not-the-secret").update(payload).digest("hex")}`;
  const forgedResponse = await fetch(`${base}/api/account/wishlist`, {
    headers: { authorization: `Bearer ${forged}` },
  });
  check("a token signed with another secret reads nothing", forgedResponse.status === 401,
    `got ${forgedResponse.status}`);

  // Session scoping, asserted from the new door as well as the old.
  const theirs = await post(
    `/api/orders/${otherOrderId}/cancel`,
    { reason: "changed_mind" },
    bearer,
  );
  check(
    "a bearer token cannot act on another customer's order",
    theirs.status === 403 || theirs.status === 404,
    `got ${theirs.status}`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n5. Rate limiting is fair behind a carrier NAT");

{
  // The lookup bucket is 5/min per IP. Two install ids from this one IP
  // must each get their own budget; one install id must still be stopped.
  const a = installId("device-a");
  const b = installId("device-b");
  const bad = { reference: "ZZZZZZZZ", email: "nobody@example.com" };

  // The bucket starts full, so five requests all pass and the sixth is the
  // first refusal. Spending exactly the allowance and then asking once more
  // is the assertion; a loop of five that expected a 429 inside it would be
  // asserting the limiter is one token stricter than it is.
  let allowed = 0;
  for (let i = 0; i < 5; i += 1) {
    const response = await post("/api/v1/session", bad, { "x-ekmool-install": a });
    if (response.status !== 429) allowed += 1;
  }
  check("an install id gets its full five a minute", allowed === 5, `${allowed} of 5`);

  const sixth = await post("/api/v1/session", bad, { "x-ekmool-install": a });
  check("the sixth is refused", sixth.status === 429, `got ${sixth.status}`);

  // The one that fails against a naive implementation: with the bucket keyed
  // on IP alone, this second customer behind the same carrier address is
  // refused for what the first one did.
  const second = await post("/api/v1/session", bad, { "x-ekmool-install": b });
  check(
    "a second install id behind the same IP still gets through",
    second.status !== 429,
    `got ${second.status}`,
  );

  const again = await post("/api/v1/session", bad, { "x-ekmool-install": a });
  check("the exhausted install id is still refused", again.status === 429, `got ${again.status}`);
}

/* ------------------------------------------------------------------ */
console.log("\n6. Nothing hands a native client a cookie");

{
  const native = {
    "x-ekmool-client": "mobile/1.0.0 (android; build 1)",
    "x-ekmool-install": installId("device-c"),
  };

  for (const path of ["/api/v1/bootstrap", "/catalog/v1.json", "/catalog/reviews-v1.json"]) {
    const response = await fetch(`${base}${path}`, { headers: native });
    check(
      `${path} sets no cookie`,
      (response.headers.getSetCookie?.() ?? []).length === 0,
    );
  }

  // And the session endpoint must not read one either: presenting a valid
  // cookie with no reference must not produce a token.
  const smuggled = await post("/api/v1/session", {}, { cookie: `ek_session=${token}` });
  check(
    "a cookie is not proof — there is no exchange endpoint",
    smuggled.status !== 200,
    `got ${smuggled.status}`,
  );
}

/* ------------------------------------------------------------------ */
await cleanup();
await db.end();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
