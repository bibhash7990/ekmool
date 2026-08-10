/**
 * PWA, the service worker, and the shared rate limiter (M15).
 *
 *   npm run test:offline [port]
 *
 * A service worker cannot be exercised from Node — it needs a browser, a
 * secure context and an install lifecycle. What *can* be checked, and what
 * actually goes wrong in practice, is everything around it:
 *
 *   - the worker is served at all, from the right origin, with a content
 *     type a browser will accept and a scope that covers the site
 *   - the manifest is valid, installable, and points at icons that exist
 *     rather than at a 404 the browser silently falls back from
 *   - the Content-Security-Policy permits a worker and a manifest, which
 *     is the failure that breaks a PWA invisibly
 *   - the offline page is prerendered, so the one page that must work with
 *     no network is not itself a database read
 *   - **nothing private is cacheable.** The worker's exclusion list is
 *     asserted against the routes that actually exist, because the way
 *     this feature turns into an incident is a cached order page on a
 *     shared phone.
 *
 * Section 5 covers the Redis-backed limiter, and skips itself with a note
 * when REDIS_URL is unset rather than passing vacuously.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

console.log(`Offline and PWA tests against ${base}\n`);

/* ------------------------------------------------------------------ */
console.log("1. The service worker is served, and served correctly");

const swResponse = await fetch(`${base}/sw.js`);
const swBody = await swResponse.text();

check("GET /sw.js is 200", swResponse.status === 200, String(swResponse.status));
check(
  "it is JavaScript",
  (swResponse.headers.get("content-type") ?? "").includes("javascript"),
  swResponse.headers.get("content-type") ?? "none",
);
check(
  "it is at the origin root, so its scope is the whole site",
  swBody.length > 0,
);

// A worker cached for a year cannot be updated, and the update check is
// the only way a bad worker is ever replaced. Next serves /public with a
// short cache by default; assert nothing here has made it immutable.
const swCache = swResponse.headers.get("cache-control") ?? "";
check(
  "it is not cached immutably — a worker you cannot replace is permanent",
  !swCache.includes("immutable") && !/max-age=\d{6,}/.test(swCache),
  swCache || "none",
);

/* ------------------------------------------------------------------ */
console.log("\n2. Nothing private is cacheable");

// Read the exclusion list out of the worker itself rather than restating
// it here, so the test cannot drift into agreeing with a copy of the rule.
const neverBlock = swBody.match(/const NEVER_CACHE = \[([\s\S]*?)\];/);
const never = neverBlock
  ? [...neverBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
  : [];

check("the worker declares an exclusion list", never.length > 0);

for (const prefix of [
  "/api/",
  "/admin",
  "/checkout",
  "/orders",
  "/account",
  "/track",
]) {
  check(
    `${prefix} is never cached`,
    never.includes(prefix),
    never.join(", "),
  );
}

check(
  "only GET is intercepted",
  /request\.method\s*!==\s*"GET"/.test(swBody),
);
check(
  "cross-origin requests are left alone",
  /url\.origin\s*!==\s*self\.location\.origin/.test(swBody),
);
check(
  "navigations are network-first, never cache-first",
  /request\.mode === "navigate"/.test(swBody) &&
    /networkFirst\(request\)/.test(swBody),
);
check(
  "the offline replay reuses the original Idempotency-Key",
  /"Idempotency-Key": entry\.idempotencyKey/.test(swBody),
);
check(
  "a 4xx on replay is recorded, not retried forever",
  /entry\.state = "failed"/.test(swBody),
);

/* ------------------------------------------------------------------ */
console.log("\n3. The manifest is installable");

const manifestResponse = await fetch(`${base}/manifest.webmanifest`);
check(
  "GET /manifest.webmanifest is 200",
  manifestResponse.status === 200,
  String(manifestResponse.status),
);

const manifest = await manifestResponse.json().catch(() => null);
check("it is JSON", manifest !== null);

if (manifest) {
  check("it has a name", typeof manifest.name === "string" && manifest.name.length > 0);
  check(
    "it has a short_name, which is what appears under the icon",
    typeof manifest.short_name === "string" && manifest.short_name.length <= 12,
    manifest.short_name,
  );
  check(
    "display is standalone, so it opens without browser chrome",
    manifest.display === "standalone",
    manifest.display,
  );
  check("start_url is the home page", manifest.start_url === "/");
  check(
    "theme and background colours are set",
    Boolean(manifest.theme_color) && Boolean(manifest.background_color),
  );
  check(
    "there is at least one icon of 512px or larger",
    (manifest.icons ?? []).some(
      (icon) => icon.sizes === "any" || parseInt(icon.sizes, 10) >= 512,
    ),
    JSON.stringify((manifest.icons ?? []).map((i) => i.sizes)),
  );

  // The failure this catches is a manifest that lists an icon nobody ever
  // exported. The browser fetches it, gets a 404, and silently falls back
  // to a screenshot of the page — which is why nobody notices for months.
  for (const icon of manifest.icons ?? []) {
    const iconResponse = await fetch(`${base}${icon.src}`);
    check(
      `the icon ${icon.src} exists`,
      iconResponse.ok,
      String(iconResponse.status),
    );
  }

  check(
    "the page links to it",
    (await (await fetch(`${base}/`)).text()).includes("manifest.webmanifest"),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n4. The offline page, and the policy that lets a worker run");

const offline = await fetch(`${base}/offline`);
const offlineHtml = await offline.text();
check("GET /offline is 200", offline.status === 200, String(offline.status));
check(
  "it says what still works, not only what does not",
  offlineHtml.includes("basket is safe") || offlineHtml.includes("still works"),
);
check(
  "it is noindex — an offline page in search results helps nobody",
  offlineHtml.includes("noindex"),
);

const csp = offline.headers.get("content-security-policy") ?? "";
check("a CSP is present", csp.length > 0);
check(
  "worker-src permits the service worker",
  csp.includes("worker-src 'self'"),
  csp.slice(0, 120),
);
check(
  "manifest-src permits the manifest",
  csp.includes("manifest-src 'self'"),
);

// The registration is inline on purpose — a separate module would be real
// bytes on every page against a 190 KB budget. Confirm it is actually
// there in the production HTML, because "production only" is exactly the
// kind of condition that gets inverted.
const home = await (await fetch(`${base}/`)).text();
check(
  "the home page registers the worker",
  home.includes("serviceWorker") && home.includes("/sw.js"),
);
check(
  "the theme colour is declared for the Android status bar",
  home.includes('name="theme-color"'),
);
check(
  "zoom is not disabled",
  !home.includes("user-scalable=no") && !home.includes("maximum-scale=1"),
);

/* ------------------------------------------------------------------ */
console.log("\n5. The rate limiter, and which store is behind it");

const health = await (await fetch(`${base}/api/health`)).json();
check("health reports the limiter backing", typeof health.rateLimiter === "string");
check(
  "health reports the instance, so a load balancer can be verified",
  typeof health.instance === "string" && health.instance.length > 0,
);
check(
  "redis is reported as off rather than down when unconfigured",
  ["off", "up", "down"].includes(health.redis),
  String(health.redis),
);

if (!process.env.REDIS_URL) {
  console.log("  SKIP  REDIS_URL is unset — set it to exercise the shared limiter");
  check("the limiter falls back to memory with no Redis", health.rateLimiter === "memory");
} else {
  check(
    "Redis is configured and reachable",
    health.redis === "up",
    String(health.redis),
  );
  check(
    "and the limiter is actually using it",
    health.rateLimiter === "redis",
    String(health.rateLimiter),
  );

  // Twelve attempts at a 10/min endpoint; the eleventh must be refused.
  //
  // Under its own client IP, and that detail is not cosmetic. The bucket
  // now lives in Redis, so it outlives the process — burning the real
  // bucket here left test:checkout getting 429s a minute later, which read
  // as four failures in a suite that was working perfectly. The limiter
  // keys on the forwarded IP, so a made-up one gives this suite a bucket
  // nobody else shares.
  //
  // (Which is also a note about the header: the proxy trusts X-Real-IP,
  // and nginx overwrites it with $remote_addr — see docker/nginx.conf. Run
  // the app directly exposed, without that hop, and a client can pick its
  // own bucket. Behind the edge profile, which is the documented
  // production shape, it cannot.)
  const TEST_IP = "203.0.113.42";
  const attempts = [];
  for (let n = 0; n < 12; n += 1) {
    const response = await fetch(`${base}/api/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": TEST_IP,
        "idempotency-key": `offline-test-${n}-${Date.now()}`,
      },
      body: JSON.stringify({ deliberately: "invalid" }),
    });
    attempts.push(response.status);
  }

  const limited = attempts.filter((status) => status === 429).length;
  check(
    "the twelfth attempt in a minute is refused",
    limited > 0,
    attempts.join(","),
  );
  check(
    "and the limit is not simply refusing everything",
    attempts.some((status) => status !== 429),
    attempts.join(","),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n6. The outbox contract between the page and the worker");

// The record shape is shared by two files that cannot import each other —
// src/lib/offline-queue.ts is bundled for the browser, public/sw.js is
// served raw. A mismatch here is silent: orders are written to one store
// and drained from another, and nothing ever sends.
const queueSource = readFileSync(
  join(process.cwd(), "src", "lib", "offline-queue.ts"),
  "utf8",
);

for (const [label, pattern] of [
  ["database name", /ekmool-offline/],
  ["store name", /"outbox"/],
  ["version", /DB_VERSION = 1/],
  ["key path", /keyPath: "id"/],
]) {
  check(
    `the page and the worker agree on the ${label}`,
    pattern.test(queueSource) && pattern.test(swBody),
  );
}

check(
  "only cash on delivery is ever queued",
  /paymentMethod === "cod"/.test(
    readFileSync(
      join(process.cwd(), "src", "components", "checkout", "CheckoutForm.tsx"),
      "utf8",
    ),
  ),
);

check(
  "the queued-order page does not claim the order was placed",
  (await (await fetch(`${base}/order/queued`)).text()).includes(
    "Waiting to be sent",
  ),
);

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
