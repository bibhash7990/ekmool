/**
 * Lighthouse audit gate. Runs mobile audits against the running server,
 * saves the JSON reports, and fails if any category drops below its
 * threshold or the script budget is exceeded.
 *
 *   node scripts/audit.mjs [port]
 *
 * Requires Chrome. Reports land in research/audits/ at the repository root.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const port = process.argv[2] ?? "3100";
const base = `http://localhost:${port}`;

/**
 * research/ stayed at the repository root in the monorepo move — it
 * documents the repo, not the web app — so the reports go two levels up out
 * of apps/web rather than under it.
 *
 * Three things already name that exact path and would break silently if the
 * output moved: the copy-pasteable commands in docs/PERFORMANCE.md and
 * docs/audit.md, and CI's `path: research/audits/` artifact upload, which
 * has `if-no-files-found: ignore` and would simply upload nothing.
 *
 * Resolved from import.meta.dirname rather than process.cwd() because cwd
 * depends on the invocation — `pnpm --filter web audit` runs in apps/web,
 * `node apps/web/scripts/audit.mjs` from the root does not — and the answer
 * has to be the same either way.
 */
const outDir = join(import.meta.dirname, "..", "..", "..", "research", "audits");

mkdirSync(outDir, { recursive: true });

/**
 * `budgetKb` is transferred script bytes, per page. See SCRIPT_BUDGETS
 * below for why this is per page rather than one number for the site.
 */
const TARGETS = [
  { name: "home", path: "/", budgetKb: 198 },
  { name: "catalog", path: "/products", budgetKb: 198 },
  {
    name: "product",
    path: "/products/lakadong-turmeric-powder",
    budgetKb: 202,
  },
  { name: "blog", path: "/blog/what-is-a-gi-tag", budgetKb: 194 },
];

/**
 * Score gates.
 *
 * `performance` is NOT here, and that is a decision rather than an
 * omission — see PERFORMANCE_MINIMUM below.
 */
const THRESHOLDS = {
  seo: 100,
  accessibility: 95,
  "best-practices": 95,
};

/**
 * The performance score, gated only where it can be trusted.
 *
 * Lighthouse's performance score is a timing measurement and GitHub's
 * shared runners do not give you the same machine twice. Five consecutive
 * CI runs of this home page, across commits that changed no client code,
 * scored 95, 97, 68, 95 and 65 — and the runs that scored 65 and 68 pulled
 * a byte-identical list of chunks to the ones that scored 95.
 *
 * A gate that reports 65 and 95 for the same bytes cannot tell a
 * regression from a busy neighbour. Failing on it does not catch slow
 * pages; it teaches everyone that a red pipeline means nothing, which is
 * how this one came to be red for twenty consecutive runs with two real
 * bugs sitting inside it.
 *
 * So it stays a hard gate locally, where the machine is yours and a low
 * score means something, and in CI it is printed with the LCP, CLS and TBT
 * beside it while the reproducible gates — script bytes, accessibility,
 * SEO, best practices — do the failing.
 */
const PERFORMANCE_MINIMUM = 90;
const PERFORMANCE_IS_A_GATE = !process.env.CI;

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
 *   198/198/202/194
 *        NOT a page getting heavier. The counting changed: scripts Chrome
 *        reports with transferSize 0 are now estimated instead of dropped,
 *        because dropping them was discarding real downloaded bytes and
 *        discarding a different number of them each run. Same builds, both
 *        rules, measured against two archived CI runs:
 *
 *          home     193.4 / 183.3  ->  193.4 / 190.8   swing 10.1 -> 2.5 KB
 *          catalog  185.4 / 193.4  ->  190.7 / 193.4   swing  8.0 -> 2.7 KB
 *          product  188.6 / 188.6  ->  196.5 / 196.5   swing  0.0 -> 0.0 KB
 *          blog     189.3 / 181.3  ->  189.3 / 186.6   swing  8.0 -> 2.7 KB
 *
 *        Every page was already over 190 on an honest count and had been
 *        passing on bytes nobody was adding up. These numbers are the
 *        observed maximum plus roughly one remaining noise band, so the
 *        thin headroom the paragraph below asks for is now real headroom
 *        rather than an artefact of what Chrome felt like reporting.
 *
 * Headroom is deliberately thin on every line above. A generous budget
 * catches nothing, which is the only thing a budget is for.
 *
 * **One number here is noisy, and you need to know how.** Next prefetches
 * the routes it finds links to — the header's cart link, mainly — at Low
 * priority. Chrome sometimes reports those responses with transferSize 0
 * and a full resourceSize, and sometimes with their real bytes, and which
 * way it goes changes between runs on the same build. Measured at M16:
 * three consecutive runs of an unchanged home page gave 189, 188 and 178.
 *
 * So a total that jumps ~9 KB is not evidence of anything on its own.
 * Before believing a regression, compare the *list* of chunks the page
 * pulls, not the sum:
 *
 *   node -e "const r=require('./research/audits/lh-home.json');
 *     console.log(r.audits['network-requests'].details.items
 *       .filter(i=>i.resourceType==='Script')
 *       .map(i=>[i.url.split('/').pop(), i.transferSize]))"
 *
 * A real regression adds a filename. That is how the wishlist chunk was
 * caught arriving on the home page in M16 — the total looked plausible,
 * the list had one entry too many.
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
  /**
   * Count every script, including the ones Chrome reports with
   * transferSize 0.
   *
   * The comment above already described this noise and told you to compare
   * the chunk list rather than the sum — but the gate went on summing, so
   * the gate inherited the noise it warned about. Measured on two archived
   * CI runs of this home page: 193.4 KB and 183.3 KB, an identical list of
   * 17 chunks, and the whole 10.1 KB difference coming from exactly two
   * requests that one run counted and the other reported as 0. On a budget
   * with no headroom that is the difference between red and green, decided
   * by Chrome rather than by the code.
   *
   * A request with transferSize 0 and a real resourceSize was still
   * fetched; only the byte accounting is missing. Estimating it from the
   * compression ratio the same run measured on the scripts it *did* report
   * is deterministic, invents no constant, and errs towards counting.
   * Undercounting is the failure mode that matters: it lets a real
   * regression through while the total still looks fine.
   *
   * The service-worker check below is what stops this becoming an excuse
   * for a warm cache — a worker-served response is a failure, not an
   * estimate.
   */
  const counted = scripts.filter((r) => (r.transferSize ?? 0) > 0);
  const countedTransfer = counted.reduce((sum, r) => sum + r.transferSize, 0);
  const countedResource = counted.reduce(
    (sum, r) => sum + (r.resourceSize ?? 0),
    0,
  );
  // Falls back to 1 (assume no compression) rather than 0, so a run that
  // reported nothing cannot silently produce a 0 KB total that passes.
  const ratio = countedResource > 0 ? countedTransfer / countedResource : 1;

  const estimated = scripts.filter(
    (r) => !(r.transferSize ?? 0) && (r.resourceSize ?? 0) > 0,
  );
  const estimatedBytes = estimated.reduce(
    (sum, r) => sum + r.resourceSize * ratio,
    0,
  );

  const scriptKb = (countedTransfer + estimatedBytes) / 1024;

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

  if (estimated.length > 0) {
    // Said out loud, because a silent estimate is a number nobody can
    // check. The filenames are what you compare between runs.
    console.log(
      `    ${estimated.length} script${estimated.length === 1 ? "" : "s"} reported 0 bytes, counted at this run's ${ratio.toFixed(3)} ratio: ${estimated
        .map((r) => r.url.split("/").pop())
        .join(", ")}`,
    );
  }

  for (const [category, minimum] of Object.entries(THRESHOLDS)) {
    if (scores[category] < minimum) {
      failures.push(
        `${target.path}: ${category} ${scores[category]} < ${minimum}`,
      );
    }
  }

  if (scores.performance < PERFORMANCE_MINIMUM) {
    const message = `${target.path}: performance ${scores.performance} < ${PERFORMANCE_MINIMUM}`;
    if (PERFORMANCE_IS_A_GATE) {
      failures.push(message);
    } else {
      // Reported, not failed. Still worth saying — a CI run scoring 40
      // twice running is worth opening, even though one scoring 65 is not.
      console.log(`    note: ${message} (not a gate in CI, timing is noisy here)`);
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
