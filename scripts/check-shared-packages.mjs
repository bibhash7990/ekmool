/**
 * Two properties of the shared packages that nothing else enforces.
 *
 * Both are cheap greps rather than anything clever, deliberately: something
 * crude that runs in CI beats something elegant that does not.
 *
 *   1. No shared package imports React.
 *
 *      apps/web is on React 19.2.8 and apps/mobile will be on the 19.2.3
 *      that Expo SDK 57 pins. pnpm's isolated store keeps those apart, and
 *      that only holds while no package in the middle pulls React in — the
 *      moment one does, the monorepo acquires a single-React constraint it
 *      does not need, and Expo's own monorepo guide names duplicate React
 *      as the leading cause of "Invalid hook call" in exactly this setup.
 *
 *      @reduxjs/toolkit is fine and is why this checks for React by name
 *      rather than banning non-relative imports: createSlice and the
 *      reducer it returns are framework-agnostic. react-redux is the
 *      binding, and that stays in each app.
 *
 *   2. @ekmool/core has no barrel export.
 *
 *      A barrel would let `import { formatPaise }` pull the whole package
 *      into any route that touches money, and Turbopack does not always
 *      shake it back out. The script budget has single-digit KB of
 *      headroom; that is not a risk worth taking for an import shortcut.
 *
 * Run: node scripts/check-shared-packages.mjs
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not new URL().pathname — the latter yields "/D:/..." on
// Windows, which every fs call then rejects.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packagesDir = join(root, "packages");

let failures = 0;
const fail = (message) => {
  console.error(`  FAIL  ${message}`);
  failures += 1;
};
const pass = (message) => console.log(`  PASS  ${message}`);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const packages = existsSync(packagesDir)
  ? readdirSync(packagesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];

if (packages.length === 0) {
  console.log("No shared packages yet — nothing to check.");
  process.exit(0);
}

// 1. React
const reactImport = /(?:from|require\()\s*["'](react|react-dom|react-redux)["']/;
const offenders = [];
for (const name of packages) {
  const src = join(packagesDir, name, "src");
  if (!existsSync(src)) continue;
  for (const file of walk(src)) {
    const text = readFileSync(file, "utf8");
    if (reactImport.test(text)) {
      offenders.push(file.slice(root.length));
    }
  }
}
if (offenders.length > 0) {
  fail(`a shared package imports React:\n        ${offenders.join("\n        ")}`);
} else {
  pass("no shared package imports react, react-dom or react-redux");
}

// 2. No barrel in core
const coreManifest = join(packagesDir, "core", "package.json");
if (existsSync(coreManifest)) {
  const exportsMap = JSON.parse(readFileSync(coreManifest, "utf8")).exports ?? {};
  if (Object.prototype.hasOwnProperty.call(exportsMap, ".")) {
    fail('@ekmool/core declares a "." export — deep entry points only');
  } else {
    pass("@ekmool/core has no barrel export");
  }
  if (existsSync(join(packagesDir, "core", "src", "index.ts"))) {
    fail("@ekmool/core/src/index.ts exists — it will become a barrel");
  } else {
    pass("@ekmool/core has no src/index.ts");
  }
}

console.log(failures === 0 ? "\nShared package checks passed." : `\n${failures} failed.`);
process.exit(failures > 0 ? 1 : 0);
