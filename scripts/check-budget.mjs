/**
 * First-load JS budget gate.
 *
 * `next build` no longer prints First Load JS in Next 16, so the budget
 * is measured from a Lighthouse run instead: sum the transfer size of
 * every script the page actually downloads.
 *
 *   node scripts/check-budget.mjs research/audits/lh-home.json [limitKb]
 */
import { readFileSync } from "node:fs";

const reportPath = process.argv[2];
const limitKb = Number(process.argv[3] ?? 170);

if (!reportPath) {
  console.error("usage: node scripts/check-budget.mjs <lighthouse.json> [limitKb]");
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const requests = report.audits?.["network-requests"]?.details?.items ?? [];

const scripts = requests.filter((r) => r.resourceType === "Script");
const totalBytes = scripts.reduce((sum, r) => sum + (r.transferSize ?? 0), 0);
const totalKb = totalBytes / 1024;

const byOrigin = new Map();
for (const script of scripts) {
  const origin = script.url.startsWith(report.finalDisplayedUrl ?? "")
    ? "first-party"
    : new URL(script.url).host;
  byOrigin.set(
    origin,
    (byOrigin.get(origin) ?? 0) + (script.transferSize ?? 0),
  );
}

console.log(`\nScript budget for ${report.finalDisplayedUrl ?? reportPath}`);
console.log(`  ${scripts.length} scripts, ${totalKb.toFixed(1)} KB transferred\n`);

for (const [origin, bytes] of [...byOrigin].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${(bytes / 1024).toFixed(1).padStart(8)} KB  ${origin}`);
}

const biggest = [...scripts]
  .sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0))
  .slice(0, 5);

console.log("\n  largest:");
for (const script of biggest) {
  const name = script.url.split("/").pop()?.slice(0, 44);
  console.log(`  ${((script.transferSize ?? 0) / 1024).toFixed(1).padStart(8)} KB  ${name}`);
}

if (totalKb > limitKb) {
  console.error(
    `\nFAIL  ${totalKb.toFixed(1)} KB exceeds the ${limitKb} KB budget by ${(totalKb - limitKb).toFixed(1)} KB`,
  );
  process.exit(1);
}

console.log(
  `\nPASS  ${totalKb.toFixed(1)} KB is within the ${limitKb} KB budget (${(limitKb - totalKb).toFixed(1)} KB spare)`,
);
