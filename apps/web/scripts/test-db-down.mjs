/**
 * Chaos test: with MySQL stopped, browsing must be completely unaffected
 * and checkout must fail in a branded, non-crashing way.
 *
 * Assumes the caller has already stopped the database:
 *   docker stop ekmool-mysql
 *   node scripts/test-db-down.mjs [port]
 *   docker start ekmool-mysql
 */

const port = process.argv[2] ?? "3100";
const base = `http://localhost:${port}`;

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

const BROWSE_PATHS = [
  "/",
  "/products",
  "/products/kandhamal-turmeric-powder",
  "/products/lakadong-turmeric-powder",
  "/products/mithila-makhana",
  "/products/guntur-chilli-powder",
  "/products/byadagi-chilli-powder",
  "/cart",
  "/checkout",
  "/sitemap.xml",
  "/robots.txt",
];

console.log(`\nChaos: database down, ${base}\n`);
console.log("1. Browsing is unaffected");

for (const path of BROWSE_PATHS) {
  const response = await fetch(`${base}${path}`);
  check(`${path} → 200`, response.status === 200, `got ${response.status}`);
}

console.log("\n2. The mobile catalogue documents are unaffected");
{
  // The whole of Phase 2 in three assertions. The app reads the catalogue
  // from these documents, and they are prerendered static output for
  // exactly this reason: an endpoint that queried MySQL to serve a product
  // list would make the phone the FIRST thing to fail in an outage, and it
  // would do it while the website beside it stayed up.
  for (const path of [
    "/catalog/v1.json",
    "/catalog/reviews-v1.json",
    "/catalog/content-v1.json",
  ]) {
    const response = await fetch(`${base}${path}`);
    check(`${path} → 200`, response.status === 200, `got ${response.status}`);
    check(
      `${path} still carries an ETag`,
      Boolean(response.headers.get("etag")),
    );
  }

  // Not an empty shell, for the same reason section 3 checks the HTML: a
  // route that answers 200 with `{"products":[]}` has failed in the way
  // that matters and passed the status check.
  const doc = await (await fetch(`${base}/catalog/v1.json`)).json();
  check(
    "the catalogue document still has all five products",
    Array.isArray(doc.products) && doc.products.length === 5,
    `${doc.products?.length} products`,
  );
}

console.log("\n3. Product content is really there (not an empty shell)");
{
  const html = await (
    await fetch(`${base}/products/lakadong-turmeric-powder`)
  ).text();
  check("price is rendered", /₹\s?279|279\.00|₹279/.test(html), "no price found");
  check("origin story is rendered", html.includes("Jaintia Hills"));
  check("Product JSON-LD survives", html.includes('"@type":"Product"'));
}

console.log("\n4. Checkout fails gracefully (503, not a crash)");
{
  const response = await fetch(`${base}/api/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `chaos-${Date.now()}`,
    },
    body: JSON.stringify({
      customer: {
        name: "Chaos Test",
        email: "chaos@example.com",
        phone: "9876543210",
      },
      address: {
        line1: "12 Residency Road",
        line2: "",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560025",
        landmark: "",
      },
      paymentMethod: "cod",
      items: [{ variantId: 1, qty: 1 }],
      notes: "",
    }),
  });
  const data = await response.json();

  check("returns 503, not 500", response.status === 503, `got ${response.status}`);
  check("code is DB_UNAVAILABLE", data.code === "DB_UNAVAILABLE", JSON.stringify(data));
  check(
    "message reassures the customer nothing was charged",
    typeof data.error === "string" && /nothing has been charged/i.test(data.error),
  );
}

console.log("\n5. Health endpoint reports the dependency honestly");
{
  const data = await (await fetch(`${base}/api/health`)).json();
  check("ok stays true (the app is alive)", data.ok === true);
  check("db reports down", data.db === "down", JSON.stringify(data));
}

console.log("\n6. No crash loop — the server still answers after the failures");
{
  const response = await fetch(`${base}/`);
  check("home still 200 after repeated DB errors", response.status === 200);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
}
process.exit(failures.length ? 1 : 0);
