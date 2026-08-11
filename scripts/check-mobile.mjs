/**
 * Four properties of apps/mobile that nothing else enforces.
 *
 * Cheap greps rather than anything clever, deliberately — something crude
 * that runs in CI beats something elegant that does not. Same reasoning as
 * scripts/check-shared-packages.mjs next door.
 *
 *   1. No nested Stack under app/(tabs)/.
 *
 *      This is the one that would cost the most. expo/expo#47687: on iOS
 *      **Release builds only**, expo-router with a Tabs layout where each tab
 *      hosts its own Stack hangs forever on the native splash — the
 *      navigator's first Fabric commit never completes. Debug builds never
 *      reproduce it. So the defect is invisible in development, invisible in
 *      review, and appears for the first time in TestFlight, which is the
 *      worst possible shape for a bug to have.
 *
 *      The failure message links the issue, because the next person to add a
 *      per-tab stack will be doing something that looks entirely reasonable.
 *
 *   2. No hex colour literal anywhere in src/ or app/.
 *
 *      docs/DESIGN-SYSTEM.md: "A hardcoded hex in a component is a review
 *      failure", on either client. The gold trap is the specific reason —
 *      gold-500 and gold-600 do not pass 4.5:1 on paper and gold-800 does,
 *      and a hand-typed #C4881F is the mistake that does not look wrong.
 *
 *      src/theme is exempt: it is the module that turns @ekmool/tokens into
 *      React Native values, so it is the one place a hex may be read.
 *      app.config.ts is exempt too, and is checked separately below.
 *
 *   3. No direct @react-navigation import.
 *
 *      expo-router owns the navigator. Reaching past it couples the app to a
 *      transitive dependency's major version, and the two disagree about who
 *      owns the route tree.
 *
 *   4. app.config.ts's colours match the tokens.
 *
 *      The config is read by the Expo CLI outside the bundler, so it cannot
 *      import @ekmool/tokens — the splash and adaptive-icon background have
 *      to be literals. That makes them the one place where a token and a
 *      literal can drift, and the symptom is a first frame in the wrong
 *      colour before React mounts, which nobody reports as a bug.
 *
 * Run: node scripts/check-mobile.mjs
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not new URL().pathname — the latter yields "/D:/..." on
// Windows, which every fs call then rejects.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mobile = join(root, "apps", "mobile");

let failures = 0;
const fail = (message) => {
  console.error(`  FAIL  ${message}`);
  failures += 1;
};
const pass = (message) => console.log(`  PASS  ${message}`);

if (!existsSync(mobile)) {
  console.log("apps/mobile does not exist yet — nothing to check.");
  process.exit(0);
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const appDir = join(mobile, "app");
const srcDir = join(mobile, "src");
const sourceFiles = [...walk(appDir), ...walk(srcDir)];
const show = (file) => relative(root, file).replace(/\\/g, "/");

/* ---------------- 1. No nested Stack under app/(tabs)/ --------------- */
{
  const tabFiles = walk(join(appDir, "(tabs)"));
  const offenders = tabFiles.filter((file) => {
    const text = readFileSync(file, "utf8");
    // The import is the reliable signal. Matching `<Stack` alone would also
    // hit the word in a comment — and the comments here talk about the
    // single root stack a great deal, on purpose.
    return /from\s+["']expo-router\/stack["']/.test(text)
      || /import\s*\{[^}]*\bStack\b[^}]*\}\s*from\s*["']expo-router["']/.test(text);
  });

  if (offenders.length > 0) {
    fail(
      "a nested Stack under app/(tabs)/:\n" +
        offenders.map((f) => `          ${show(f)}`).join("\n") +
        "\n\n        Every tab is a single screen and every detail screen pushes onto the" +
        "\n        ROOT stack in app/_layout.tsx. A per-tab Stack hangs iOS Release" +
        "\n        builds forever on the native splash and never reproduces in a debug" +
        "\n        build: https://github.com/expo/expo/issues/47687",
    );
  } else {
    pass("no nested Stack under app/(tabs)/");
  }
}

/* ---------------- 2. No hex colour literals -------------------------- */
{
  const HEX = /#[0-9a-fA-F]{3,8}\b/;
  const themeDir = join(srcDir, "theme");
  const offenders = [];

  for (const file of sourceFiles) {
    if (file.startsWith(themeDir)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      // Skip comment lines: the design docs quoted in comments name the
      // tokens by value, and that is the right thing for a comment to do.
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) return;
      if (HEX.test(line)) offenders.push(`${show(file)}:${i + 1}  ${trimmed.slice(0, 72)}`);
    });
  }

  if (offenders.length > 0) {
    fail(
      "a hardcoded colour outside src/theme:\n" +
        offenders.map((o) => `          ${o}`).join("\n") +
        "\n\n        Import from @/theme, which derives everything from @ekmool/tokens." +
        "\n        gold-800 is the only gold that passes 4.5:1 as ink.",
    );
  } else {
    pass("no hardcoded colour outside src/theme");
  }
}

/* ---------------- 3. No direct @react-navigation --------------------- */
{
  const offenders = sourceFiles.filter((file) =>
    /(?:from|require\()\s*["']@react-navigation\//.test(readFileSync(file, "utf8")),
  );

  if (offenders.length > 0) {
    fail(
      "@react-navigation imported directly:\n" +
        offenders.map((f) => `          ${show(f)}`).join("\n") +
        "\n\n        expo-router owns the navigator. Import from expo-router instead.",
    );
  } else {
    pass("no direct @react-navigation import");
  }
}

/* ---------------- 4. app.config.ts agrees with the tokens ------------ */
{
  const configPath = join(mobile, "app.config.ts");
  const tokensPath = join(root, "packages", "tokens", "src", "tokens.ts");

  if (existsSync(configPath) && existsSync(tokensPath)) {
    const tokens = readFileSync(tokensPath, "utf8");
    // The paper token, read out of the source rather than imported: this
    // script is plain Node with no TypeScript loader, and a regex over one
    // well-known key is cheaper than adding one.
    const paper = /paper\s*:\s*["'](#[0-9a-fA-F]{6})["']/.exec(tokens)?.[1];

    if (!paper) {
      fail("could not find the `paper` colour in packages/tokens/src/tokens.ts");
    } else {
      const config = readFileSync(configPath, "utf8");
      const literals = [...config.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
      const wrong = literals.filter((hex) => hex.toUpperCase() !== paper.toUpperCase());

      if (literals.length === 0) {
        fail("app.config.ts declares no background colour — the first frame will be white");
      } else if (wrong.length > 0) {
        fail(
          `app.config.ts uses ${[...new Set(wrong)].join(", ")} where the paper token is ${paper}.\n` +
            "        The config cannot import the tokens (the Expo CLI reads it outside the\n" +
            "        bundler), so these literals are checked instead of trusted.",
        );
      } else {
        pass(`app.config.ts colours match the paper token (${paper})`);
      }
    }
  }
}

console.log(failures === 0 ? "\nMobile checks passed." : `\n${failures} failed.`);
process.exit(failures > 0 ? 1 : 0);
