/**
 * Checkout under sustained load — 50 orders/second, every one a distinct
 * buyer with a distinct Idempotency-Key.
 *
 * What this is actually testing is oversell. 50 rps against a catalogue
 * holding a few hundred units means demand deliberately exceeds supply, so
 * the run ends with every variant at exactly zero and a pile of 409s. The
 * pass condition is arithmetic, checked in SQL afterwards by
 * scripts/loadtest.mjs:
 *
 *     units sold == starting stock - ending stock,  and stock never < 0
 *
 * If the atomic `UPDATE ... WHERE stock_qty >= ?` were instead a read
 * followed by a write, concurrent iterations would interleave and sell the
 * same unit twice. That is the bug this run exists to catch.
 *
 * 201 and 409 are both correct responses here. 5xx is not, and neither is
 * 429 — each iteration presents a unique X-Forwarded-For because 50 real
 * orders a second come from ~50 different people, not one hammering client.
 * A 429 would mean the limiter is keying on something too coarse.
 *
 *   k6 run scripts/k6/checkout-50rps.js
 *
 * Requires scripts/k6/data/checkout-variants.json — written by
 * scripts/loadtest.mjs, which reads the real seeded variant ids.
 */
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { SharedArray } from "k6/data";

const BASE = __ENV.BASE_URL || "http://localhost:3100";
const RPS = Number(__ENV.RPS || 50);
const DURATION = __ENV.DURATION || "30s";
const RUN_ID = __ENV.RUN_ID || "local";

const variants = new SharedArray("variants", () =>
  JSON.parse(open("./data/checkout-variants.json")),
);

const created = new Counter("orders_created");
const soldOut = new Counter("orders_rejected_sold_out");
const rateLimited = new Counter("orders_rate_limited");
const serverErrors = new Counter("orders_server_error");

export const options = {
  scenarios: {
    checkout: {
      executor: "constant-arrival-rate",
      rate: RPS,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: 60,
      maxVUs: 200,
    },
  },
  thresholds: {
    orders_server_error: ["count==0"],
    orders_rate_limited: ["count==0"],
    "checks{kind:accepted}": ["rate==1"],
    http_req_duration: ["p(95)<2000"],
  },
};

/** Unique per iteration across the whole run — one simulated buyer each. */
function iterationId() {
  return `${RUN_ID}-${__VU}-${__ITER}`;
}

/** Distinct source address per buyer, so the per-IP limiter is exercised
    the way production would exercise it rather than throttling the test. */
function syntheticIp() {
  const n = (__VU * 100003 + __ITER) % 16777216;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

export default function () {
  const variant = variants[Math.floor(Math.random() * variants.length)];

  const body = {
    customer: {
      name: "Load Test Buyer",
      email: `loadtest+${iterationId()}@example.com`,
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
    notes: `k6 ${RUN_ID}`,
  };

  const response = http.post(`${BASE}/api/checkout`, JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "idempotency-key": `k6-${iterationId()}`,
      "x-forwarded-for": syntheticIp(),
    },
    tags: { name: "POST /api/checkout" },
  });

  if (response.status === 201) created.add(1);
  else if (response.status === 409) soldOut.add(1);
  else if (response.status === 429) rateLimited.add(1);
  else if (response.status >= 500) serverErrors.add(1);

  check(
    response,
    {
      // Sold out is a correct answer, not a failure.
      "created or cleanly sold out": (r) =>
        r.status === 201 || r.status === 409,
    },
    { kind: "accepted" },
  );
}

export function handleSummary(data) {
  return {
    "research/loadtest/checkout-50rps.json": JSON.stringify(data, null, 2),
    stdout: summarise(data),
  };
}

function summarise(data) {
  const count = (name) => data.metrics[name]?.values?.count ?? 0;
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"] ?? 0;
  return [
    "",
    `  created            ${count("orders_created")}`,
    `  rejected sold out  ${count("orders_rejected_sold_out")}`,
    `  rate limited       ${count("orders_rate_limited")}`,
    `  server errors      ${count("orders_server_error")}`,
    `  p95 latency        ${p95.toFixed(0)} ms`,
    "",
  ].join("\n");
}
