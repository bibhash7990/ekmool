/**
 * VPS scheduling adapter. Vercel Cron drives the same /api/jobs/* routes
 * via vercel.json; on a VPS this process does it instead, under PM2.
 *
 *   node scripts/cron-runner.mts
 *
 * Schedules (Asia/Kolkata):
 *   hourly       abandoned-payment-reminder
 *   hourly :30   final-notice
 *   08:00 IST    low-stock-report
 *   03:30 IST    cancel-stale-orders
 *
 * Vercel cron expressions are UTC, so vercel.json uses 02:30 and 03:00
 * UTC for the two daily jobs. node-cron takes a timezone, so the times
 * here are written directly in IST.
 */
import cron from "node-cron";
import { loadEnv } from "./load-env.mts";

loadEnv();

/**
 * Where to POST the job routes. This is an INTERNAL address, which is not
 * the same thing as the public one: under Docker the app is reachable at
 * http://app:3000 on the compose network, while NEXT_PUBLIC_APP_URL is the
 * customer-facing https:// origin used for canonicals and emails. Sending
 * cron traffic to the public URL would leave the container depending on
 * DNS and TLS it does not need, and would fail outright before the domain
 * exists. Falls back to the public URL for the PM2/bare-metal case, where
 * they legitimately are the same host.
 */
const BASE_URL =
  process.env.CRON_TARGET_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";
const SECRET = process.env.CRON_SECRET ?? "";
const TIMEZONE = "Asia/Kolkata";

if (!SECRET) {
  console.error(
    "CRON_SECRET is not set. The job routes will reject every call — refusing to start.",
  );
  process.exit(1);
}

async function runJob(name: string): Promise<void> {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/api/jobs/${name}`, {
      method: "POST",
      headers: { "x-cron-secret": SECRET },
    });
    const body = await response.text();
    const ms = Date.now() - startedAt;
    if (response.ok) {
      console.log(`[cron] ${name} ok in ${ms}ms — ${body}`);
    } else {
      console.error(`[cron] ${name} HTTP ${response.status} in ${ms}ms — ${body}`);
    }
  } catch (error) {
    console.error(`[cron] ${name} threw:`, error);
  }
}

const SCHEDULE: { expression: string; job: string; description: string }[] = [
  {
    expression: "0 * * * *",
    job: "abandoned-payment-reminder",
    description: "hourly",
  },
  {
    // Offset half an hour from the first reminder so the two sweeps do not
    // contend for the same rows in the same second.
    expression: "30 * * * *",
    job: "final-notice",
    description: "hourly",
  },
  {
    expression: "0 8 * * *",
    job: "low-stock-report",
    description: "08:00 IST daily",
  },
  {
    expression: "30 3 * * *",
    job: "cancel-stale-orders",
    description: "03:30 IST daily",
  },
];

for (const entry of SCHEDULE) {
  cron.schedule(entry.expression, () => void runJob(entry.job), {
    timezone: TIMEZONE,
  });
  console.log(
    `[cron] scheduled ${entry.job.padEnd(28)} ${entry.expression.padEnd(12)} (${entry.description})`,
  );
}

console.log(`[cron] runner active against ${BASE_URL} in ${TIMEZONE}`);

// `--once <job>` runs a single job immediately and exits — useful for
// verifying wiring without waiting for a schedule to fire.
const onceIndex = process.argv.indexOf("--once");
if (onceIndex !== -1) {
  const job = process.argv[onceIndex + 1];
  if (!job) {
    console.error("--once requires a job name");
    process.exit(1);
  }
  await runJob(job);
  process.exit(0);
}
