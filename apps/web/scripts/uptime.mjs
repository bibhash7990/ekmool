/**
 * Uptime monitoring against /api/health.
 *
 *   npm run uptime -- https://ekmool.com
 *
 * A hosted monitor (UptimeRobot, Better Stack, Pingdom) is the better
 * answer for most shops and docs/deploy.md says so — an external service
 * notices when the whole machine is gone, which a process on that machine
 * cannot. This is for the case where you want one anyway: no account, no
 * third party seeing your traffic, and it understands the health payload
 * rather than only its status code.
 *
 * The rules it works to:
 *
 *   **`ok` is the page, not the dependencies.** /api/health reports `ok`
 *   true while the database is down, because browsing is served from
 *   static output and customers are unaffected. A monitor that pages
 *   somebody for that teaches them to ignore it. Degraded dependencies are
 *   reported at a lower severity and never wake anyone.
 *
 *   **Alert on the transition, not on the state.** One notification when
 *   it goes down and one when it comes back. A monitor that emails every
 *   sixty seconds for four hours is a monitor whose emails get filtered.
 *
 *   **Two failures before alerting.** A single timeout is a network blip
 *   somewhere between here and there, and paging on it is how you train
 *   people to distrust the alarm.
 */
import { loadEnv } from "./load-env.mts";

loadEnv();

const target =
  process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const INTERVAL_MS = Math.max(15, Number(process.env.UPTIME_INTERVAL ?? 60)) * 1000;
const FAILURES_BEFORE_ALERT = Math.max(
  1,
  Number(process.env.UPTIME_THRESHOLD ?? 2),
);
const TIMEOUT_MS = 10_000;

const STAMP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  dateStyle: "short",
  timeStyle: "medium",
});

let consecutiveFailures = 0;
let alerting = false;
/** Reported once per transition, so a long outage is not a long inbox. */
let lastDegraded = "";

function log(level, message) {
  console.log(`${STAMP.format(new Date())} [${level}] ${message}`);
}

/**
 * Where an alert goes.
 *
 * A webhook, because every destination worth having speaks one — Slack,
 * Discord, Telegram via a relay, an SMS gateway, your own endpoint. Unset,
 * it logs and nothing else, which is honest: a monitor that silently fails
 * to notify is worse than no monitor, so it says on startup which of the
 * two it is.
 */
async function notify(subject, body) {
  log("ALERT", `${subject} — ${body}`);

  const webhook = (process.env.UPTIME_WEBHOOK_URL ?? "").trim();
  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `text` is what Slack and Discord both read; anything else can pick
      // the structured fields out.
      body: JSON.stringify({
        text: `*${subject}*\n${body}`,
        subject,
        body,
        target,
        at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    log("WARN", `the webhook itself failed: ${error.message}`);
  }
}

async function probe() {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${target}/api/health`, {
      signal: controller.signal,
      headers: { "cache-control": "no-cache" },
    });
    const ms = Date.now() - startedAt;

    if (!response.ok) {
      return { up: false, ms, reason: `HTTP ${response.status}` };
    }

    const body = await response.json();
    if (body.ok !== true) {
      return { up: false, ms, reason: "health reported not ok" };
    }

    return { up: true, ms, body };
  } catch (error) {
    return {
      up: false,
      ms: Date.now() - startedAt,
      reason: error.name === "AbortError" ? `no answer in ${TIMEOUT_MS}ms` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function tick() {
  const result = await probe();

  if (result.up) {
    if (alerting) {
      await notify(
        "Ekmool is back",
        `${target} answered in ${result.ms}ms after ${consecutiveFailures} failed checks.`,
      );
      alerting = false;
    }
    consecutiveFailures = 0;

    // Degraded but serving. Worth knowing, not worth waking up for — and
    // reported only when it changes.
    const degraded = [
      result.body.db === "down" && "database unreachable",
      result.body.redis === "down" && "redis unreachable",
    ]
      .filter(Boolean)
      .join(", ");

    if (degraded !== lastDegraded) {
      if (degraded) {
        log("WARN", `serving, but degraded: ${degraded}`);
      } else if (lastDegraded) {
        log("INFO", "dependencies healthy again");
      }
      lastDegraded = degraded;
    }

    log("OK", `${result.ms}ms · db ${result.body.db} · redis ${result.body.redis}`);
    return;
  }

  consecutiveFailures += 1;
  log("FAIL", `${result.reason} (${consecutiveFailures} in a row)`);

  if (consecutiveFailures >= FAILURES_BEFORE_ALERT && !alerting) {
    alerting = true;
    await notify(
      "Ekmool is down",
      `${target} has failed ${consecutiveFailures} checks in a row. Last reason: ${result.reason}.`,
    );
  }
}

log(
  "INFO",
  `watching ${target} every ${INTERVAL_MS / 1000}s, alerting after ${FAILURES_BEFORE_ALERT} failures`,
);
log(
  "INFO",
  process.env.UPTIME_WEBHOOK_URL
    ? "alerts go to UPTIME_WEBHOOK_URL"
    : "UPTIME_WEBHOOK_URL is unset — alerts are logged here and nowhere else",
);

await tick();
setInterval(() => void tick(), INTERVAL_MS);
