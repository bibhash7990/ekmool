/**
 * Webhook storm — 500 concurrent deliveries of the *same* payment event.
 *
 * Razorpay retries on timeout and can deliver the same event more than
 * once, sometimes overlapping. If two deliveries both read "unpaid" before
 * either writes, a naive handler marks the order paid twice: two
 * confirmation emails, two status-history rows, and an order whose audit
 * trail claims it was paid twice.
 *
 * The gate is exact, not statistical: across 500 deliveries fired 50-wide,
 * `transitioned: true` must come back exactly once. Everything else must
 * be a clean 200 no-op. Two mechanisms have to hold for that — the
 * `payment_status <> 'paid'` guard inside the transaction, and the UNIQUE
 * index on orders.razorpay_payment_id that catches whoever loses the race.
 *
 *   k6 run scripts/k6/webhook-storm.js
 *
 * Requires scripts/k6/data/webhook-event.json — written by
 * scripts/loadtest.mjs, which creates a real order and signs the payload
 * with the server's actual RAZORPAY_WEBHOOK_SECRET.
 */
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3100";
const DELIVERIES = Number(__ENV.DELIVERIES || 500);
const CONCURRENCY = Number(__ENV.CONCURRENCY || 50);

/* Read at init time — every VU sends byte-identical bytes, which is the
   whole point. Re-serialising per iteration could reorder JSON keys and
   invalidate the signature. */
const event = JSON.parse(open("./data/webhook-event.json"));

const transitions = new Counter("webhook_transitions");
const noops = new Counter("webhook_noops");
const nonOk = new Counter("webhook_non_200");

export const options = {
  scenarios: {
    storm: {
      executor: "shared-iterations",
      vus: CONCURRENCY,
      iterations: DELIVERIES,
      maxDuration: "2m",
    },
  },
  thresholds: {
    // The entire test, in one line.
    webhook_transitions: ["count==1"],
    webhook_non_200: ["count==0"],
    // Razorpay gives up on a webhook that takes longer than a few seconds.
    http_req_duration: ["p(95)<2000"],
  },
};

export default function () {
  const response = http.post(`${BASE}/api/payment/webhook`, event.body, {
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": event.signature,
    },
    tags: { name: "POST /api/payment/webhook" },
  });

  if (response.status !== 200) {
    nonOk.add(1);
  } else {
    let transitioned = false;
    try {
      transitioned = JSON.parse(response.body).transitioned === true;
    } catch {
      nonOk.add(1);
    }
    if (transitioned) transitions.add(1);
    else noops.add(1);
  }

  check(response, {
    "always 200": (r) => r.status === 200,
  });
}

export function handleSummary(data) {
  return {
    "research/loadtest/webhook-storm.json": JSON.stringify(data, null, 2),
    stdout: summarise(data),
  };
}

function summarise(data) {
  const count = (name) => data.metrics[name]?.values?.count ?? 0;
  return [
    "",
    `  deliveries      ${count("webhook_transitions") + count("webhook_noops") + count("webhook_non_200")}`,
    `  transitions     ${count("webhook_transitions")}  (must be exactly 1)`,
    `  no-op replays   ${count("webhook_noops")}`,
    `  non-200         ${count("webhook_non_200")}`,
    "",
  ].join("\n");
}
