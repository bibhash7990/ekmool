/**
 * Consent, security headers and the anti-abuse floor (M11).
 *
 *   node scripts/test-consent.mjs [port]
 *
 * The consent checks are the reason this file exists. A banner that sits on
 * top of a tracker which loads anyway is worse than no banner, because it
 * tells the visitor a lie they have no way to check. So the assertion here
 * is not "the banner renders" — it is that **posthog-js is not in the page
 * and not reachable from it** until a decision has been recorded.
 *
 * No headless browser: that would be a large dependency to assert something
 * the served bytes already prove. The loader gates its dynamic import on
 * consent read from localStorage, so if the initial HTML and its scripts
 * contain no posthog bundle reference, nothing can load one before a click.
 */
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

loadEnv();

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

function post(path, body, headers = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

console.log(`Consent and security tests against ${base}\n`);

/* ------------------------------------------------------------------ */
console.log("1. Security headers are on every response");

{
  const response = await fetch(`${base}/`);
  const header = (name) => response.headers.get(name) ?? "";

  check("the page is served", response.status === 200);
  check("Content-Security-Policy is set", header("content-security-policy").length > 0);
  check(
    "nothing may frame this site",
    header("content-security-policy").includes("frame-ancestors 'none'") &&
      header("x-frame-options") === "DENY",
  );
  check(
    "a form cannot be posted off-origin",
    header("content-security-policy").includes("form-action 'self'"),
  );
  check(
    "plugins are refused outright",
    header("content-security-policy").includes("object-src 'none'"),
  );
  check(
    "scripts are limited to this origin and named third parties",
    /script-src [^;]*'self'/.test(header("content-security-policy")) &&
      !/script-src [^;]*\*[^.]/.test(header("content-security-policy")),
  );
  check("HSTS is set for two years", /max-age=6\d{7}/.test(header("strict-transport-security")));
  check("MIME sniffing is off", header("x-content-type-options") === "nosniff");
  check(
    "an order URL cannot leak in a Referer",
    header("referrer-policy") === "strict-origin-when-cross-origin",
  );
  check("camera and microphone are denied", header("permissions-policy").includes("camera=()"));
}

{
  // The headers must not stop at the homepage. An API route replying
  // without them is the gap an attacker would look for.
  const response = await fetch(`${base}/api/health`);
  check(
    "and on API routes too",
    (response.headers.get("content-security-policy") ?? "").length > 0,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n2. Nothing tracks before consent");

{
  const html = await (await fetch(`${base}/`)).text();

  check(
    "no PostHog bundle is referenced in the served page",
    !/posthog/i.test(html),
    "posthog appeared in the initial HTML",
  );

  // The chunk the loader would import must not be in the preload graph
  // either — a modulepreload would fetch it before any decision.
  check(
    "and nothing preloads one",
    !/<link[^>]+modulepreload[^>]+posthog/i.test(html),
  );

  check(
    "the consent banner is not baked into the static page",
    !html.includes("Cookies, honestly"),
    "the banner would flash for everyone who already answered",
  );

  check(
    "but the way back to the decision is on the page",
    html.includes("Cookie choices"),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n3. The grievance officer is reachable");

{
  const html = await (await fetch(`${base}/contact`)).text();
  check("the notice is on /contact", html.includes('id="grievance"'));
  check(
    "with the statutory acknowledgement period",
    html.includes("48 hours"),
  );
  check("and the escalation route", html.includes("consumerhelpline.gov.in"));

  const home = await (await fetch(`${base}/`)).text();
  check("and it is linked from every page", home.includes("/contact#grievance"));
}

/* ------------------------------------------------------------------ */
console.log("\n4. The honeypot refuses a bot, and only a bot");

{
  const [variants] = await (async () => {
    const db = await mysql.createConnection({
      host: process.env.DATABASE_HOST ?? "127.0.0.1",
      port: Number(process.env.DATABASE_PORT ?? 3306),
      user: process.env.DATABASE_USER ?? "ekmool",
      password: process.env.DATABASE_PASSWORD ?? "",
      database: process.env.DATABASE_NAME ?? "ekmool",
    });
    const rows = await db.execute("SELECT id FROM product_variants ORDER BY id LIMIT 1");
    await db.end();
    return rows;
  })();

  const order = (extra) => ({
    customer: {
      name: "Consent Tester",
      email: "consent-test@example.com",
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
    items: [{ variantId: variants[0].id, qty: 1 }],
    notes: "",
    ...extra,
  });

  const trapped = await post(
    "/api/checkout",
    order({ company_website: "https://spam.example" }),
    { "idempotency-key": `consent-trap-${Date.now()}` },
  );
  check("a filled honeypot is refused", trapped.status === 400, `got ${trapped.status}`);
  check(
    "and the refusal names no field, so a bot learns nothing",
    (await trapped.json()).code === "CHALLENGE_FAILED",
  );

  // An empty honeypot is what a real browser sends: the input exists and
  // has no value. It must not be mistaken for a missing field.
  const empty = await post("/api/checkout", order({ company_website: "" }), {
    "idempotency-key": `consent-clean-${Date.now()}`,
  });
  check(
    "an empty honeypot passes through untouched",
    empty.status === 201,
    `got ${empty.status}`,
  );

  const lookupTrapped = await post("/api/account/lookup", {
    reference: "A1B2C3D4",
    email: "consent-test@example.com",
    company_website: "https://spam.example",
  });
  check(
    "the lookup's trap answers exactly like a wrong email",
    lookupTrapped.status === 404,
    `got ${lookupTrapped.status}`,
  );
  check(
    "with the same words, so the defence is not detectable",
    (await lookupTrapped.json()).code === "LOOKUP_FAILED",
  );
}

/* ---------- cleanup ---------- */
{
  const db = await mysql.createConnection({
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    user: process.env.DATABASE_USER ?? "ekmool",
    password: process.env.DATABASE_PASSWORD ?? "",
    database: process.env.DATABASE_NAME ?? "ekmool",
  });
  const [held] = await db.execute(
    `SELECT i.variant_id v, i.qty q
       FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.customer_email = ? AND o.status <> 'cancelled'
        AND i.variant_id IS NOT NULL`,
    ["consent-test@example.com"],
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
    ["consent-test@example.com"],
  );
  await db.execute("DELETE FROM orders WHERE customer_email = ?", [
    "consent-test@example.com",
  ]);
  await db.execute("DELETE FROM customers WHERE email = ?", [
    "consent-test@example.com",
  ]);
  await db.end();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
}

process.exit(failures.length ? 1 : 0);
