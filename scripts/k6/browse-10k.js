/**
 * Browse load — the "survives 10,000 concurrent users" test.
 *
 * 10,000 concurrent *browsing users* is not 10,000 simultaneous in-flight
 * requests. A person reading a product page spends ten to thirty seconds on
 * it. At a 20 s think time, 10,000 users generate:
 *
 *     10,000 / 20 s = 500 requests/second
 *
 * So the number the origin actually has to sustain is ~500 rps of public
 * page traffic, and that is what MODE=rate (the default) measures. It is
 * also the honest thing to measure from one laptop, where trying to hold
 * 10,000 real sockets open hits ephemeral-port and CPU limits of the load
 * generator long before it stresses the server.
 *
 * MODE=vus drives literal concurrency instead, for when you have the
 * hardware to do it — on real infrastructure, `k6 run -e MODE=vus -e VUS=10000`.
 *
 *   k6 run scripts/k6/browse-10k.js
 *   k6 run -e RPS=800 -e DURATION=2m scripts/k6/browse-10k.js
 *   k6 run -e MODE=vus -e VUS=2000 scripts/k6/browse-10k.js
 *
 * Every path here is statically generated or ISR-cached, so a passing run
 * means the origin served this load without touching MySQL. The DB-down
 * chaos run in scripts/chaos-browse.mjs proves that claim directly.
 */
import http from "k6/http";
import { check } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3100";
const MODE = __ENV.MODE || "rate";
const RPS = Number(__ENV.RPS || 500);
const VUS = Number(__ENV.VUS || 1000);
const DURATION = __ENV.DURATION || "60s";

/* Weighted like real catalogue traffic: most arrivals land on a product
   page from search, fewer on the home page, fewer still on editorial. */
const PATHS = [
  { path: "/", weight: 15 },
  { path: "/products", weight: 20 },
  { path: "/products/lakadong-turmeric-powder", weight: 14 },
  { path: "/products/kandhamal-turmeric-powder", weight: 12 },
  { path: "/products/mithila-makhana", weight: 12 },
  { path: "/products/guntur-chilli-powder", weight: 8 },
  { path: "/products/byadagi-chilli-powder", weight: 8 },
  { path: "/blog/what-is-a-gi-tag", weight: 4 },
  { path: "/blog/lakadong-vs-kandhamal-turmeric", weight: 3 },
  { path: "/about", weight: 2 },
  { path: "/faq", weight: 2 },
];

/* Expand the weights once at init time so each iteration is a single
   index lookup rather than a scan. */
const WEIGHTED = PATHS.flatMap((entry) =>
  new Array(entry.weight).fill(entry.path),
);

const rateScenario = {
  executor: "constant-arrival-rate",
  rate: RPS,
  timeUnit: "1s",
  duration: DURATION,
  preAllocatedVUs: Math.min(RPS, 400),
  maxVUs: Math.max(RPS * 2, 800),
};

const vusScenario = {
  executor: "ramping-vus",
  startVUs: 0,
  stages: [
    { duration: "30s", target: Math.floor(VUS / 2) },
    { duration: "30s", target: VUS },
    { duration: DURATION, target: VUS },
    { duration: "15s", target: 0 },
  ],
};

export const options = {
  // Bodies are never inspected here; parsing them would measure k6, not us.
  discardResponseBodies: true,
  summaryTrendStats: ["min", "med", "p(95)", "p(99)", "max"],
  scenarios: { browse: MODE === "vus" ? vusScenario : rateScenario },
  thresholds: {
    // The real requirement: a browsing user never sees an error. These two
    // are the gate.
    http_req_failed: ["rate<0.001"],
    checks: ["rate>0.999"],
    // Latency is recorded, not really gated. The load generator shares a
    // CPU with the server it is measuring, so absolute milliseconds here
    // describe this laptop, not production — where a CDN answers these
    // paths and the origin never sees them. A generous ceiling that only
    // trips on a genuine stall. See docs/loadtest.md for the rps ladder.
    http_req_duration: ["p(95)<1500"],
  },
};

export function handleSummary(data) {
  const label = MODE === "vus" ? `vus${VUS}` : `rps${RPS}`;
  return {
    [`research/loadtest/browse-${label}.json`]: JSON.stringify(data, null, 2),
    stdout: summarise(data),
  };
}

function summarise(data) {
  const reqs = data.metrics.http_reqs?.values ?? {};
  const failed = data.metrics.http_req_failed?.values ?? {};
  const row = (label, metric) => {
    const v = data.metrics[metric]?.values ?? {};
    return `  ${label.padEnd(14)} ${(v.med ?? 0).toFixed(1).padStart(8)} ${(v["p(95)"] ?? 0).toFixed(1).padStart(9)} ${(v["p(99)"] ?? 0).toFixed(1).padStart(9)} ${(v.max ?? 0).toFixed(1).padStart(9)}`;
  };
  return [
    "",
    `  mode            ${MODE === "vus" ? `${VUS} VUs` : `${RPS} rps`}`,
    `  requests        ${reqs.count ?? 0} (${(reqs.rate ?? 0).toFixed(1)}/s)`,
    `  failed          ${((failed.rate ?? 0) * 100).toFixed(3)}%`,
    "",
    `  ms                   p50       p95       p99       max`,
    // Splitting these apart is what tells you whether a tail is the server
    // thinking or the load generator failing to get a socket.
    row("total", "http_req_duration"),
    row("connecting", "http_req_connecting"),
    row("waiting(TTFB)", "http_req_waiting"),
    row("receiving", "http_req_receiving"),
    "",
  ].join("\n");
}

export default function () {
  const path = WEIGHTED[Math.floor(Math.random() * WEIGHTED.length)];
  const response = http.get(`${BASE}${path}`, {
    tags: { name: path },
    headers: {
      accept: "text/html",
      // Every real browser sends this, and it changes the test by more than
      // you would guess: a product page is 82 KB raw and 14.8 KB gzipped.
      // Omitting it measures the server shipping 5.5x the bytes it would
      // ever actually ship, which is not a result worth having.
      "accept-encoding": "gzip",
    },
  });

  check(response, {
    "status is 200": (r) => r.status === 200,
  });
}
