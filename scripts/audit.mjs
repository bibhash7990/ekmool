/**
 * Lighthouse audit gate. Runs mobile audits against the running server,
 * saves the JSON reports, and fails if any category drops below its
 * threshold or the script budget is exceeded.
 *
 *   node scripts/audit.mjs [port]
 *
 * Requires Chrome. Reports land in research/audits/.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const port = process.argv[2] ?? "3100";
const base = `http://localhost:${port}`;
const outDir = join(process.cwd(), "research", "audits");

mkdirSync(outDir, { recursive: true });

/**
 * `budgetKb` is transferred script bytes, per page. See SCRIPT_BUDGETS
 * below for why this is per page rather than one number for the site.
 */
const TARGETS = [
  { name: "home", path: "/", budgetKb: 190 },
  { name: "catalog", path: "/products", budgetKb: 190 },
  {
    name: "product",
    path: "/products/lakadong-turmeric-powder",
    budgetKb: 200,
  },
  { name: "blog", path: "/blog/what-is-a-gi-tag", budgetKb: 190 },
];

const THRESHOLDS = {
  seo: 100,
  performance: 90,
  accessibility: 95,
  "best-practices": 95,
};

/**
 * Transferred script bytes. **Per page, and that is the point.**
 *
 * It was one number for the whole site until M12, when the product page
 * needed 200 and the honest choice looked like raising every page to 200 —
 * which would have quietly licensed the home page to grow 13 KB it has no
 * use for. A single budget always drifts up to whatever the heaviest page
 * needs. Per-page numbers keep the pages that stayed light *pinned* light.
 *
 * History, so nobody raises these by reflex:
 *
 *   170  M6-M10. Every page sat at 166-169.
 *   190  M11. The consent layer cost ~15 KB on every page — the banner, the
 *        footer control that withdraws consent, and the store they share.
 *        Not slack: a DPDP Act requirement, most of it the copy explaining
 *        what each category does. Shortening that prose would have bought
 *        bytes by making the consent less informed.
 *   200  M12, product page only. Save-for-later, the PIN code delivery
 *        estimate and recently-viewed cost 8.7 KB there (185 -> 193.7).
 *        The chunk was opened and read before this moved: the one genuinely
 *        avoidable item, the out-of-stock form plus its Turnstile widget,
 *        is now behind next/dynamic and is not fetched at all while a pack
 *        is in stock. Home, catalogue and blog absorbed M12 within 190 and
 *        stay there.
 *
 * Headroom is deliberately thin on every line above. A generous budget
 * catches nothing, which is the only thing a budget is for.
 */

const results = [];
const failures = [];

for (const target of TARGETS) {
  const outPath = join(outDir, `lh-${target.name}.json`);
  process.stdout.write(`Auditing ${target.path} … `);

  try {
    // shell: true is required — Node 22 refuses to spawnSync a .cmd shim
    // directly on Windows, which is what `npx` is there. That in turn means
    // every argument containing a space (the output path, the chrome flags)
    // has to carry its own quotes.
    execFileSync(
      "npx",
      [
        "--yes",
        "lighthouse",
        `"${base}${target.path}"`,
        "--only-categories=performance,accessibility,best-practices,seo",
        "--form-factor=mobile",
        "--screenEmulation.mobile",
        "--quiet",
        "--output=json",
        `--output-path="${outPath}"`,
        '--chrome-flags="--headless=new --no-sandbox --disable-gpu"',
      ],
      { stdio: ["ignore", "ignore", "pipe"], timeout: 300_000, shell: true },
    );
  } catch (error) {
    console.log("FAILED TO RUN");
    failures.push(`${target.path}: lighthouse did not complete — ${error.message}`);
    continue;
  }

  if (!existsSync(outPath)) {
    console.log("NO REPORT");
    failures.push(`${target.path}: no report written`);
    continue;
  }

  const report = JSON.parse(readFileSync(outPath, "utf8"));
  const scores = Object.fromEntries(
    Object.entries(report.categories).map(([key, cat]) => [
      key,
      Math.round(cat.score * 100),
    ]),
  );

  const requests = report.audits?.["network-requests"]?.details?.items ?? [];

  const scripts = requests.filter((r) => r.resourceType === "Script");
  const scriptKb =
    scripts.reduce((sum, r) => sum + (r.transferSize ?? 0), 0) / 1024;

  /**
   * The budget must measure a first visit, not a returning one.
   *
   * Since M15 there is a service worker caching /_next/static cache-first,
   * and a response it serves has a transferSize of zero. If one were ever
   * counted here the budget would quietly start measuring a warm cache and
   * would absorb a real regression without complaining — precisely the
   * failure a budget exists to prevent.
   *
   * Measured when the worker landed: Lighthouse registers it on `load`,
   * after the trace window, so no script request comes from it. This
   * asserts that rather than trusting it to stay true.
   */
  const fromWorker = scripts.filter((r) => r.fromServiceWorker);
  if (fromWorker.length > 0) {
    failures.push(
      `${target.path}: ${fromWorker.length} script(s) came from the service worker — this is measuring a warm cache, not a first visit`,
    );
  }

  // With no third-party keys configured, the page must talk to nobody but
  // us. Fonts are self-hosted by next/font, Sentry and PostHog stay
  // uninitialised, and Razorpay's checkout.js only loads on /checkout when
  // a key exists — so any off-origin request here is a leak.
  const offOrigin = requests
    .map((r) => r.url)
    .filter((url) => /^https?:/i.test(url) && !url.startsWith(base));
  if (offOrigin.length) {
    failures.push(
      `${target.path}: ${offOrigin.length} third-party request(s) with no keys set — ${[
        ...new Set(offOrigin.map((u) => new URL(u).host)),
      ].join(", ")}`,
    );
  }

  const metrics = {
    lcp: report.audits["largest-contentful-paint"]?.displayValue ?? "-",
    cls: report.audits["cumulative-layout-shift"]?.displayValue ?? "-",
    tbt: report.audits["total-blocking-time"]?.displayValue ?? "-",
    fcp: report.audits["first-contentful-paint"]?.displayValue ?? "-",
  };

  results.push({ ...target, scores, scriptKb, metrics });
  console.log(
    `perf ${scores.performance} · a11y ${scores.accessibility} · bp ${scores["best-practices"]} · seo ${scores.seo} · ${scriptKb.toFixed(0)}/${target.budgetKb} KB js`,
  );

  for (const [category, minimum] of Object.entries(THRESHOLDS)) {
    if (scores[category] < minimum) {
      failures.push(
        `${target.path}: ${category} ${scores[category]} < ${minimum}`,
      );
    }
  }
  if (scriptKb > target.budgetKb) {
    failures.push(
      `${target.path}: script transfer ${scriptKb.toFixed(1)} KB > ${target.budgetKb} KB budget`,
    );
  }
}

console.log("\n| Page | Perf | A11y | BP | SEO | JS | LCP | CLS | TBT |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  console.log(
    `| \`${r.path}\` | ${r.scores.performance} | ${r.scores.accessibility} | ${r.scores["best-practices"]} | ${r.scores.seo} | ${r.scriptKb.toFixed(0)}/${r.budgetKb} KB | ${r.metrics.lcp} | ${r.metrics.cls} | ${r.metrics.tbt} |`,
  );
}

if (failures.length) {
  console.error(`\n${failures.length} gate failure(s):`);
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}

console.log("\nAll Lighthouse gates passed.");
