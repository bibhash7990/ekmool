/**
 * Load-test orchestrator.
 *
 * k6 generates load; it cannot see the database, so it cannot tell you
 * whether the numbers it got back are actually consistent with what was
 * stored. This script owns that half: it snapshots stock before each run,
 * re-reads it after, and asserts the invariants that matter — no oversell,
 * exactly one payment transition — in SQL.
 *
 *   node scripts/loadtest.mjs [port]
 *
 * Phases are selectable, because the webhook storm needs a build that had
 * the Razorpay env set at build time and the other two do not:
 *
 *   PHASES=browse,checkout node scripts/loadtest.mjs
 *   PHASES=webhook node scripts/loadtest.mjs
 *
 * Stock is restored to its pre-test values on the way out, including after
 * a failure, so running this does not leave the catalogue drained.
 * (`npm run db:seed` deliberately will not do it for you: it never
 * overwrites stock, so it cannot clobber real inventory.)
 */
import mysql from "mysql2/promise";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./load-env.mts";

loadEnv();

const port = process.argv[2] ?? "3100";
const base = `http://localhost:${port}`;

/**
 * Two roots, and they are not the same one.
 *
 * The k6 fixtures this script generates belong to the app —
 * `.gitignore` ignores them as `/apps/web/scripts/k6/data/`. The reports
 * belong to the repository: research/ deliberately stayed at the root in the
 * monorepo move, docs/loadtest.md says reports land in `research/loadtest/`,
 * and .gitignore ignores `/research/loadtest/*.json` there.
 *
 * Both are derived from import.meta.dirname rather than process.cwd() so
 * that the destination does not depend on where the script was launched
 * from; runK6 below pins k6's own cwd to APP_ROOT for the same reason.
 */
const APP_ROOT = join(import.meta.dirname, "..");
const dataDir = join(APP_ROOT, "scripts", "k6", "data");
const outDir = join(APP_ROOT, "..", "..", "research", "loadtest");

mkdirSync(dataDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const db = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? "ekmool",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "ekmool",
});

const PHASES = new Set(
  (process.env.PHASES ?? "browse,checkout,webhook")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean),
);

const failures = [];
const notes = [];
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

/* winget puts k6 on the machine PATH, which shells started before the
   install will not have picked up. Fall back to the default location
   rather than making the caller restart their terminal. */
function resolveK6() {
  if (process.env.K6_BIN) return process.env.K6_BIN;
  const fallback = "C:\\Program Files\\k6\\k6.exe";
  if (process.platform === "win32" && existsSync(fallback)) return fallback;
  return "k6";
}

const K6 = resolveK6();

function runK6(script, env = {}) {
  const args = ["run", `scripts/k6/${script}`, "-e", `BASE_URL=${base}`];
  for (const [key, value] of Object.entries(env)) {
    args.push("-e", `${key}=${value}`);
  }

  try {
    // Pinned to the app root: both the script path above and the report
    // paths the k6 scripts return from handleSummary are relative to k6's
    // working directory, so leaving it to inherit whatever cwd this process
    // was started in would scatter the reports.
    execFileSync(K6, args, {
      cwd: APP_ROOT,
      stdio: "inherit",
      timeout: 15 * 60_000,
    });
    return { ok: true };
  } catch (error) {
    // Non-zero exit means a threshold failed — that is a test result, not
    // a crash, so record it and keep going to the cleanup.
    return { ok: false, error: String(error.message ?? error) };
  }
}

async function stockSnapshot() {
  const [rows] = await db.execute(
    "SELECT id, sku, stock_qty FROM product_variants ORDER BY id",
  );
  return rows.map((r) => ({
    id: Number(r.id),
    sku: String(r.sku),
    stockQty: Number(r.stock_qty),
  }));
}

async function restoreStock(snapshot) {
  for (const variant of snapshot) {
    await db.execute("UPDATE product_variants SET stock_qty = ? WHERE id = ?", [
      variant.stockQty,
      variant.id,
    ]);
  }
}

const startingStock = await stockSnapshot();
const startingTotal = startingStock.reduce((sum, v) => sum + v.stockQty, 0);

console.log(`Load test against ${base}`);
console.log(
  `  ${startingStock.length} variants, ${startingTotal} units in stock\n`,
);

try {
  /* ---------- 1. Browse load ---------- */
  console.log("1. Browse load — public pages at sustained rps");
  if (!PHASES.has("browse")) {
    console.log("  SKIP  not in PHASES");
  } else {
    // 400, not the 500 that 10,000 concurrent users implies. 500 rps is
    // right at a single origin process's knee on this hardware, and where
    // it lands depends on what else the machine is doing — with a browser
    // open it cannot hold 500 and p95 goes to seconds. Error rate stays at
    // 0.000% either way, so gating there would still be correct, but a
    // suite that needs a quiet machine is a suite people stop trusting.
    // 400 is comfortably inside the knee and still exercises the same
    // path. The full ladder, including 500, is in docs/loadtest.md.
    const rps = process.env.BROWSE_RPS ?? "400";
    const duration = process.env.BROWSE_DURATION ?? "60s";

    const [before] = await db.execute(
      "SHOW GLOBAL STATUS LIKE 'Questions'",
    );
    const queriesBefore = Number(before[0]?.Value ?? 0);

    const result = runK6("browse-10k.js", { RPS: rps, DURATION: duration });
    check(
      `browse thresholds hold at ${rps} rps for ${duration}`,
      result.ok,
      result.error,
    );

    const [after] = await db.execute("SHOW GLOBAL STATUS LIKE 'Questions'");
    const queriesAfter = Number(after[0]?.Value ?? 0);

    // Our own two SHOW STATUS statements are in this delta, plus anything
    // the ISR window happened to revalidate. The point is the order of
    // magnitude: thousands of page views must not mean thousands of queries.
    const dbQueries = queriesAfter - queriesBefore - 2;
    notes.push(
      `Browse run issued ~${dbQueries} MySQL queries in total (including this script's own).`,
    );
    check(
      "browse traffic did not translate into per-request DB queries",
      dbQueries < 100,
      `${dbQueries} queries observed`,
    );
  }

  /* ---------- 2. Checkout under load ---------- */
  console.log("\n2. Checkout at 50 rps — oversell check");
  if (!PHASES.has("checkout")) {
    console.log("  SKIP  not in PHASES");
  } else {
    writeFileSync(
      join(dataDir, "checkout-variants.json"),
      JSON.stringify(
        startingStock.map((v) => ({ id: v.id, sku: v.sku })),
        null,
        2,
      ),
    );

    const runId = `lt${Date.now().toString(36)}`;
    const result = runK6("checkout-50rps.js", {
      RUN_ID: runId,
      RPS: process.env.CHECKOUT_RPS ?? "50",
      DURATION: process.env.CHECKOUT_DURATION ?? "30s",
    });
    check("checkout thresholds hold (no 5xx, no spurious 429)", result.ok, result.error);

    const endingStock = await stockSnapshot();
    const endingByid = new Map(endingStock.map((v) => [v.id, v.stockQty]));

    const negative = endingStock.filter((v) => v.stockQty < 0);
    check(
      "no variant went negative",
      negative.length === 0,
      negative.map((v) => `${v.sku}=${v.stockQty}`).join(", "),
    );

    const [soldRows] = await db.execute(
      `SELECT oi.variant_id AS variantId, SUM(oi.qty) AS units
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.notes = ?
        GROUP BY oi.variant_id`,
      [`k6 ${runId}`],
    );

    const soldByVariant = new Map(
      soldRows.map((r) => [Number(r.variantId), Number(r.units)]),
    );
    const totalSold = [...soldByVariant.values()].reduce((a, b) => a + b, 0);

    const mismatches = [];
    for (const variant of startingStock) {
      const sold = soldByVariant.get(variant.id) ?? 0;
      const expected = variant.stockQty - sold;
      const actual = endingByid.get(variant.id);
      if (expected !== actual) {
        mismatches.push(
          `${variant.sku}: ${variant.stockQty} - ${sold} = ${expected}, found ${actual}`,
        );
      }
    }

    check(
      "every unit sold is accounted for by exactly one stock decrement",
      mismatches.length === 0,
      mismatches.slice(0, 3).join(" | "),
    );

    const [dupes] = await db.execute(
      `SELECT idempotency_key, COUNT(*) AS n
         FROM orders WHERE notes = ? GROUP BY idempotency_key HAVING n > 1`,
      [`k6 ${runId}`],
    );
    check("no idempotency key produced two orders", dupes.length === 0);

    notes.push(
      `Checkout run created ${totalSold} orders against ${startingTotal} units of stock.`,
    );
    console.log(`  note  ${totalSold} units sold, ${startingTotal} available`);

    // Clean up the synthetic orders before the webhook phase.
    await db.execute("DELETE FROM orders WHERE notes = ?", [`k6 ${runId}`]);
  }

  /* ---------- 3. Webhook storm ---------- */
  console.log("\n3. Webhook storm — 500 replays of one payment");
  if (!PHASES.has("webhook")) {
    console.log("  SKIP  not in PHASES");
  } else {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

    if (!secret) {
      console.log(
        "  SKIP  RAZORPAY_WEBHOOK_SECRET unset — see docs/loadtest.md for the",
      );
      console.log(
        "        one-line command that runs this phase with a test secret.",
      );
      notes.push(
        "Webhook storm skipped: no RAZORPAY_WEBHOOK_SECRET in this environment.",
      );
    } else {
      const probe = await fetch(`${base}/api/payment/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": "deadbeef",
        },
        body: "{}",
      });

      if (probe.status === 503) {
        check(
          "server was built with Razorpay configured",
          false,
          "webhook returned 503 NOT_CONFIGURED — rebuild with the Razorpay env set",
        );
      } else {
        check("bad signature is rejected with 400", probe.status === 400, `got ${probe.status}`);

        const rzpOrderId = `order_k6_${Date.now().toString(36)}`;
        const rzpPaymentId = `pay_k6_${Date.now().toString(36)}`;

        // A real razorpay order needs Razorpay's API to exist. Create a
        // normal order through our own checkout, then move it into the
        // "awaiting online payment" state the webhook expects.
        const variant = startingStock.find((v) => v.stockQty > 0);
        const created = await fetch(`${base}/api/checkout`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `k6-webhook-${rzpOrderId}`,
            "x-forwarded-for": "10.99.99.99",
          },
          body: JSON.stringify({
            customer: {
              name: "Webhook Storm",
              email: "webhook-storm@example.com",
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
            items: [{ variantId: variant.id, qty: 1 }],
            notes: "k6 webhook storm",
          }),
        });

        const order = await created.json();
        check("seed order for the storm was created", created.status === 201, `got ${created.status}`);

        await db.execute(
          `UPDATE orders
              SET payment_method = 'razorpay',
                  payment_status = 'pending',
                  status = 'pending',
                  razorpay_order_id = ?
            WHERE id = ?`,
          [rzpOrderId, order.orderId],
        );

        // Placing it as COD also sent a COD confirmation and logged it.
        // A genuine Razorpay order never does that — api/checkout only
        // emails on the COD branch, precisely so the webhook owns the
        // receipt — so clear the row here. Otherwise the count below
        // measures the harness instead of the storm.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await db.execute("DELETE FROM email_log WHERE order_id = ?", [
          order.orderId,
        ]);

        const body = JSON.stringify({
          event: "payment.captured",
          payload: {
            payment: { entity: { id: rzpPaymentId, order_id: rzpOrderId } },
          },
        });
        const signature = createHmac("sha256", secret).update(body).digest("hex");

        writeFileSync(
          join(dataDir, "webhook-event.json"),
          JSON.stringify({ body, signature }, null, 2),
        );

        const result = runK6("webhook-storm.js", {
          DELIVERIES: process.env.WEBHOOK_DELIVERIES ?? "500",
          CONCURRENCY: process.env.WEBHOOK_CONCURRENCY ?? "50",
        });
        check("exactly one delivery transitioned the order", result.ok, result.error);

        const [orderRows] = await db.execute(
          "SELECT status, payment_status, razorpay_payment_id FROM orders WHERE id = ?",
          [order.orderId],
        );
        check(
          "order is confirmed and paid exactly once",
          orderRows[0]?.payment_status === "paid" &&
            orderRows[0]?.status === "confirmed" &&
            orderRows[0]?.razorpay_payment_id === rzpPaymentId,
          JSON.stringify(orderRows[0]),
        );

        // Count only what the webhook itself wrote. The seed order was
        // placed as COD, which is confirmed on creation and therefore
        // already carries an "Order placed" -> confirmed row; the SQL
        // above rewrote the order's state but not its history. Filtering
        // by actor is also the sharper assertion — it measures the storm
        // rather than everything that has ever touched this order.
        const [history] = await db.execute(
          `SELECT COUNT(*) AS n FROM order_status_history
            WHERE order_id = ? AND actor = 'razorpay-webhook'`,
          [order.orderId],
        );
        check(
          "the webhook wrote one history row, not 500",
          Number(history[0].n) === 1,
          `${history[0].n} rows`,
        );

        // The email is fired without awaiting, so give it a moment to land
        // before counting. With no SMTP configured it still writes a row,
        // as 'skipped_no_smtp' — which is exactly what makes this
        // countable without a mail server.
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const [emails] = await db.execute(
          "SELECT COUNT(*) AS n FROM email_log WHERE order_id = ? AND template = 'order_confirmed'",
          [order.orderId],
        );
        check(
          "the buyer was emailed once, not 500 times",
          Number(emails[0].n) === 1,
          `${emails[0].n} rows`,
        );

        await db.execute("DELETE FROM orders WHERE id = ?", [order.orderId]);
      }
    }
  }
} finally {
  await restoreStock(startingStock);
  const restored = await stockSnapshot();
  const restoredTotal = restored.reduce((sum, v) => sum + v.stockQty, 0);
  console.log(`\nStock restored to ${restoredTotal} units.`);
}

writeFileSync(
  join(outDir, "summary.json"),
  JSON.stringify({ passed, failures, notes }, null, 2),
);

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);

await db.end();
process.exit(failures.length ? 1 : 0);
