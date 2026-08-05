/**
 * Chaos test — kill MySQL while the site is under live traffic.
 *
 * scripts/test-db-down.mjs already covers the *static* case: bring the
 * database down, then browse. This covers the harder one, where the
 * database disappears mid-flight with requests already in progress:
 *
 *   1. Browsing must not notice at all. Every public page is prerendered,
 *      so a browse request that arrives during the outage should be served
 *      from the same cache it always was — same status, same real content,
 *      not a fallback shell.
 *
 *   2. Checkout must fail honestly. It genuinely cannot work without the
 *      database, so the requirement is not "keep working" — it is "fail as
 *      503 DB_UNAVAILABLE with nothing charged", never a 500, and recover
 *      by itself once the database returns.
 *
 *   node scripts/chaos.mjs [port]
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

loadEnv();

const port = process.argv[2] ?? "3100";
const base = `http://localhost:${port}`;
const container = process.env.MYSQL_CONTAINER ?? "ekmool-mysql";

const failures = [];
let passed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function resolveK6() {
  if (process.env.K6_BIN) return process.env.K6_BIN;
  const fallback = "C:\\Program Files\\k6\\k6.exe";
  if (process.platform === "win32" && existsSync(fallback)) return fallback;
  return "k6";
}

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", timeout: 120_000 }).trim();
}

async function waitForDb(up, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      const body = await response.json();
      if ((body.db === "up") === up) return true;
    } catch {
      /* health itself must never throw, but do not let a blip end the run */
    }
    await sleep(1000);
  }
  return false;
}

console.log(`Chaos test against ${base} (container: ${container})\n`);

/* ---------- 1. Kill the database mid-browse ---------- */
console.log("1. MySQL dies during a browse load");
{
  const k6 = spawn(
    resolveK6(),
    [
      "run",
      "scripts/k6/browse-10k.js",
      "-e",
      `BASE_URL=${base}`,
      "-e",
      "RPS=200",
      "-e",
      "DURATION=40s",
      "--quiet",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let k6Out = "";
  k6.stdout.on("data", (chunk) => (k6Out += chunk));
  k6.stderr.on("data", (chunk) => (k6Out += chunk));

  // Let it settle, then pull the plug halfway through.
  await sleep(12_000);
  console.log("  ...stopping MySQL mid-flight");
  docker("stop", container);

  const wentDown = await waitForDb(false, 60_000);
  check("health reports the database as down", wentDown);

  // The real assertion: a page fetched *while the DB is gone* still has
  // its actual content, not an error page that happens to return 200.
  const during = await fetch(`${base}/products/lakadong-turmeric-powder`);
  const html = await during.text();
  check("product page still returns 200 with MySQL stopped", during.status === 200, `got ${during.status}`);
  check(
    "and still contains real content, not a fallback shell",
    html.includes("Lakadong") && html.includes("₹") && html.includes('"@type":"Product"'),
  );

  const catalog = await fetch(`${base}/products`);
  check("catalogue still returns 200", catalog.status === 200, `got ${catalog.status}`);

  console.log("  ...restarting MySQL");
  docker("start", container);

  const k6Exit = await new Promise((resolve) => k6.on("close", resolve));
  const failedLine = /failed\s+([\d.]+)%/.exec(k6Out);
  const failedPct = failedLine ? Number(failedLine[1]) : NaN;

  check(
    "browse traffic saw zero failures across the outage",
    failedPct === 0,
    `k6 reported ${Number.isNaN(failedPct) ? "no parseable rate" : `${failedPct}%`}`,
  );
  check("browse thresholds still held", k6Exit === 0, `k6 exited ${k6Exit}`);

  const backUp = await waitForDb(true, 90_000);
  check("database came back and health noticed", backUp);
}

/* ---------- 1b. Revalidate while the database is down ---------- */
// Regression test for a real outage. `generateStaticParams` re-runs on
// every ISR revalidation, and with dynamicParams = false its result is the
// complete set of paths the route serves. When it ran during a MySQL
// outage the catalogue read failed, the set collapsed to empty, and all
// five product pages returned NoFallbackError — and stayed 404 after the
// database came back, because the empty result had been cached.
//
// Waiting out the 1-hour ISR window would make this untestable, so force
// the revalidation on demand instead. Same code path, no waiting.
console.log("\n1b. Forced revalidation while MySQL is down");
{
  const secret = process.env.REVALIDATE_SECRET ?? "";

  if (!secret) {
    console.log("  SKIP  REVALIDATE_SECRET unset");
  } else {
    console.log("  ...stopping MySQL");
    docker("stop", container);
    await waitForDb(false, 60_000);

    const revalidated = await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: { "x-revalidate-secret": secret },
    });
    check(
      "revalidate endpoint answers even with the database down",
      revalidated.status === 200,
      `got ${revalidated.status}`,
    );

    // Give the regeneration a moment to actually run.
    await sleep(3000);

    const slugs = [
      "lakadong-turmeric-powder",
      "kandhamal-turmeric-powder",
      "mithila-makhana",
      "guntur-chilli-powder",
      "byadagi-chilli-powder",
    ];
    const statuses = [];
    for (const slug of slugs) {
      const response = await fetch(`${base}/products/${slug}`);
      statuses.push(response.status);
    }
    check(
      "product pages survive a revalidation that happens during an outage",
      statuses.every((s) => s === 200),
      `statuses: ${statuses.join(",")}`,
    );

    console.log("  ...restarting MySQL");
    docker("start", container);
    await waitForDb(true, 90_000);

    const after = await fetch(`${base}/products/lakadong-turmeric-powder`);
    check(
      "and are still 200 once it returns",
      after.status === 200,
      `got ${after.status}`,
    );
  }
}

/* ---------- 2. Kill the database mid-checkout ---------- */
console.log("\n2. MySQL dies during checkout traffic");
{
  const results = [];
  let stopping = false;

  function orderBody(n) {
    return {
      customer: {
        name: "Chaos Buyer",
        email: `chaos-${n}@example.com`,
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
      notes: "chaos",
    };
  }

  const runId = Date.now().toString(36);
  const driver = (async () => {
    for (let n = 0; n < 60; n += 1) {
      const started = stopping;
      try {
        const response = await fetch(`${base}/api/checkout`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `chaos-${runId}-${n}`,
            // Distinct source per request so the limiter is not the thing
            // under test here.
            "x-forwarded-for": `10.50.${Math.floor(n / 256)}.${n % 256}`,
          },
          body: JSON.stringify(orderBody(n)),
        });
        const body = await response.json().catch(() => ({}));
        results.push({ n, status: response.status, code: body.code, duringOutage: started });
      } catch (error) {
        results.push({ n, status: 0, code: `fetch-threw:${error.message}`, duringOutage: started });
      }
      await sleep(250);
    }
  })();

  await sleep(4000);
  console.log("  ...stopping MySQL mid-checkout");
  stopping = true;
  docker("stop", container);
  await waitForDb(false, 60_000);

  await sleep(4000);
  console.log("  ...restarting MySQL");
  docker("start", container);
  await waitForDb(true, 90_000);
  stopping = false;

  await driver;

  const statuses = new Map();
  for (const r of results) statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
  console.log(
    `  note  status counts: ${[...statuses].map(([s, c]) => `${s}×${c}`).join(", ")}`,
  );

  check("no request threw or timed out", results.every((r) => r.status !== 0));

  const serverErrors = results.filter((r) => r.status >= 500 && r.status !== 503);
  check(
    "the outage produced 503s, never a 500",
    serverErrors.length === 0,
    serverErrors.map((r) => `#${r.n}=${r.status}`).slice(0, 5).join(", "),
  );

  const unavailable = results.filter((r) => r.status === 503);
  check(
    "at least one request hit the outage window",
    unavailable.length > 0,
    "the database may have stopped too slowly to catch one",
  );
  check(
    "every 503 carries the DB_UNAVAILABLE contract code",
    unavailable.every((r) => r.code === "DB_UNAVAILABLE"),
    [...new Set(unavailable.map((r) => r.code))].join(", "),
  );

  // Recovery: orders placed after the restart must succeed again with no
  // intervention.
  const tail = results.slice(-8);
  check(
    "checkout recovered on its own once MySQL returned",
    tail.some((r) => r.status === 201 || r.status === 409),
    `tail statuses: ${tail.map((r) => r.status).join(",")}`,
  );

  const created = results.filter((r) => r.status === 201).length;
  console.log(`  note  ${created} orders created, ${unavailable.length} refused during the outage`);
}

/* ---------- Cleanup ---------- */
// The checkout phase places real orders against real stock. Leaving them
// behind would quietly drain the catalogue every time this runs, so put
// the units back and drop the synthetic orders.
console.log("\n3. Cleanup");
{
  const db = await mysql.createConnection({
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    user: process.env.DATABASE_USER ?? "ekmool",
    password: process.env.DATABASE_PASSWORD ?? "",
    database: process.env.DATABASE_NAME ?? "ekmool",
  });

  const [held] = await db.execute(
    `SELECT oi.variant_id AS variantId, SUM(oi.qty) AS units
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.notes = 'chaos'
      GROUP BY oi.variant_id`,
  );

  for (const row of held) {
    await db.execute(
      "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
      [Number(row.units), Number(row.variantId)],
    );
  }

  const [result] = await db.execute("DELETE FROM orders WHERE notes = 'chaos'");

  // Checkout creates a customer row per email address, so the sweep has to
  // reach those too or a run leaves hundreds of them behind.
  const [customers] = await db.execute(
    "DELETE FROM customers WHERE email LIKE 'chaos-%@example.com'",
  );

  const restored = held.reduce((sum, r) => sum + Number(r.units), 0);
  console.log(
    `  removed ${result.affectedRows} chaos orders and ${customers.affectedRows} customers, returned ${restored} units to stock`,
  );

  await db.end();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
process.exit(failures.length ? 1 : 0);
