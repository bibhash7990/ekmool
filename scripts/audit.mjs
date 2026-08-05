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

const TARGETS = [
  { name: "home", path: "/" },
  { name: "catalog", path: "/products" },
  { name: "product", path: "/products/lakadong-turmeric-powder" },
  { name: "blog", path: "/blog/what-is-a-gi-tag" },
];

const THRESHOLDS = {
  seo: 100,
  performance: 90,
  accessibility: 95,
  "best-practices": 95,
};

/**
 * Transferred script bytes per page.
 *
 * Raised from 170 to 190 in M11, and the reason is worth recording so the
 * next person does not raise it again by reflex.
 *
 * The consent layer cost ~15 KB transferred on every page: the banner, the
 * footer control that lets a decision be withdrawn, and the store the two
 * share. That is not slack — it is a legally required feature under the DPDP
 * Act 2023, and most of the weight is the copy explaining what each category
 * actually does. Shortening that prose would buy bytes by making the consent
 * less informed, which is optimising precisely the wrong thing.
 *
 * Measured before and after on the same build machine: 166 KB at M10,
 * 181 KB at M11. The headroom left is deliberately thin, because this number
 * exists to catch creep and a generous budget catches nothing.
 */
const SCRIPT_BUDGET_KB = 190;

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
    `perf ${scores.performance} · a11y ${scores.accessibility} · bp ${scores["best-practices"]} · seo ${scores.seo} · ${scriptKb.toFixed(0)} KB js`,
  );

  for (const [category, minimum] of Object.entries(THRESHOLDS)) {
    if (scores[category] < minimum) {
      failures.push(
        `${target.path}: ${category} ${scores[category]} < ${minimum}`,
      );
    }
  }
  if (scriptKb > SCRIPT_BUDGET_KB) {
    failures.push(
      `${target.path}: script transfer ${scriptKb.toFixed(1)} KB > ${SCRIPT_BUDGET_KB} KB budget`,
    );
  }
}

console.log("\n| Page | Perf | A11y | BP | SEO | JS | LCP | CLS | TBT |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  console.log(
    `| \`${r.path}\` | ${r.scores.performance} | ${r.scores.accessibility} | ${r.scores["best-practices"]} | ${r.scores.seo} | ${r.scriptKb.toFixed(0)} KB | ${r.metrics.lcp} | ${r.metrics.cls} | ${r.metrics.tbt} |`,
  );
}

if (failures.length) {
  console.error(`\n${failures.length} gate failure(s):`);
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}

console.log("\nAll Lighthouse gates passed.");
