/**
 * Five properties of apps/mobile that nothing else enforces.
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
 *      app.config.js is exempt too, and is checked separately below.
 *
 *   3. No direct @react-navigation import.
 *
 *      expo-router owns the navigator. Reaching past it couples the app to a
 *      transitive dependency's major version, and the two disagree about who
 *      owns the route tree.
 *
 *   4. app.config.js's colours match the tokens.
 *
 *      The config is read by the Expo CLI outside the bundler, so it cannot
 *      import @ekmool/tokens — the splash and adaptive-icon background have
 *      to be literals. That makes them the one place where a token and a
 *      literal can drift, and the symptom is a first frame in the wrong
 *      colour before React mounts, which nobody reports as a bug.
 *
 *   5. Rule 5: a product nobody has reviewed shows no rating at all.
 *
 *      "Never fabricate social proof. No seeded reviews, no invented
 *      ratings... A product nobody has reviewed shows no rating at all — not
 *      a zero." The web asserts both directions of exactly this in
 *      `test:home`. There is no Lighthouse and no DOM here to assert against,
 *      so the phone's version is structural: the single component that may
 *      render a rating must refuse before it renders, and no other file may
 *      draw the marks.
 *
 *      Five sub-assertions, and each was negative-tested by planting the
 *      violation and watching this check go red:
 *
 *        a. src/components/reviews/ProductRating.tsx exists.
 *        b. Its `if (…) return null` precedes its first JSX `return (`. A
 *           gate placed after the render is not a gate.
 *        c. No zero-rating fallback (`?? 0`, `|| 0`, `average: 0`) anywhere
 *           in app/ or src/. A default of zero IS the invented rating.
 *        d. None of the forbidden empty-state phrases in app/ or src/ —
 *           "be the first", "no reviews yet", "0.0 out of". Rule 5 covers
 *           the *shape* of proof as well as the substance: a heading over
 *           grey marks claims a product has been ignored rather than that
 *           it is new.
 *        e. RatingMarks is imported only by the two components that gate it.
 *           Otherwise a screen draws five marks and rule 5 lives in a file
 *           nobody went through.
 *
 *      The positive direction — a product WITH reviews shows the real
 *      figures — is covered by (a)+(b) requiring a JSX return that reads
 *      `average` and `count`. A grep cannot render a component, so the rest
 *      of that direction is a manual item: see the note printed on failure.
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

/* ---------------- 3b. Screens read documents through the wrappers ---- */
{
  // A screen calling `useCachedDocument` directly has to pass the cache key
  // as a string, and four of them passed "catalog" and "content" while
  // `CATALOG_DOCUMENT.cacheKey` says "catalog-v1". The app therefore kept
  // **two copies** of the catalogue in kv-store, fetched it cold twice, and
  // could show a price on the Shop tab that the cart disagreed with — none
  // of which typechecks as wrong, because both arguments are strings.
  //
  // The wrappers (`useCatalog`, `useReviews`, `useContent`) take no
  // arguments, so there is nothing to get wrong. This check keeps the hole
  // closed rather than trusting the next person to notice a literal.
  const screens = sourceFiles.filter((file) =>
    file.startsWith(join(mobile, "app")),
  );
  const offenders = screens.filter((file) =>
    /\buseCachedDocument\s*[<(]/.test(readFileSync(file, "utf8")),
  );

  if (offenders.length > 0) {
    fail(
      "a screen calls useCachedDocument directly:\n" +
        offenders.map((f) => `          ${show(f)}`).join("\n") +
        "\n\n        Use useCatalog() / useReviews() / useContent() from" +
        "\n        src/hooks/useCachedDocument.ts. Passing the cache key by" +
        "\n        hand is how the catalogue ended up cached twice.",
    );
  } else {
    pass("screens read documents through the typed wrappers");
  }
}

/* ---------------- 4. app.config.js agrees with the tokens ------------ */
{
  const configPath = join(mobile, "app.config.js");
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
        fail("app.config.js declares no background colour — the first frame will be white");
      } else if (wrong.length > 0) {
        fail(
          `app.config.js uses ${[...new Set(wrong)].join(", ")} where the paper token is ${paper}.\n` +
            "        The config cannot import the tokens (the Expo CLI reads it outside the\n" +
            "        bundler), so these literals are checked instead of trusted.",
        );
      } else {
        pass(`app.config.js colours match the paper token (${paper})`);
      }
    }
  }
}

/* ---------------- 5. Rule 5: no rating on an unreviewed product ------ */
{
  const reviewsDir = join(srcDir, "components", "reviews");
  const gatePath = join(reviewsDir, "ProductRating.tsx");
  const marksPath = join(reviewsDir, "RatingMarks.tsx");
  const listPath = join(reviewsDir, "ReviewList.tsx");

  const rule5 = (detail) =>
    fail(
      `${detail}\n\n` +
        "        Rule 5: a product nobody has reviewed shows no rating at all — not a\n" +
        "        zero, not grey marks, not a heading over nothing. The gate is the\n" +
        "        `return null` in src/components/reviews/ProductRating.tsx and it is\n" +
        "        the only one; every surface that shows a rating mounts that component.\n" +
        "        The web asserts both directions of this in `pnpm --filter web test:home`.",
    );

  // (a) the gate exists at all
  if (!existsSync(gatePath)) {
    rule5("src/components/reviews/ProductRating.tsx is missing");
  } else {
    const gate = readFileSync(gatePath, "utf8");

    // (b) the refusal precedes the render
    const guard = gate.search(/^[ \t]*if\s*\(.*\)\s*return null;[ \t]*$/m);
    const render = gate.search(/^[ \t]*return\s*\(\s*$/m);

    if (guard === -1) {
      rule5("ProductRating.tsx has no `if (…) return null;` guard");
    } else if (render === -1) {
      rule5("ProductRating.tsx never returns JSX — nothing renders a real rating");
    } else if (guard > render) {
      rule5(
        "ProductRating.tsx returns JSX before its `return null` guard —\n" +
          "        a gate placed after the render is not a gate",
      );
    } else if (!/\baverage\b/.test(gate) || !/\bcount\b/.test(gate)) {
      // The positive direction: with a rating, the real figures are shown.
      rule5(
        "ProductRating.tsx no longer reads both `average` and `count` —\n" +
          "        the direction where a reviewed product DOES show its rating is gone",
      );
    } else {
      pass("rule 5: ProductRating refuses before it renders");
    }
  }

  // (c) + (d) no invented zero, no empty-state placeholder copy
  const INVENTED_ZERO =
    /(rating|average|count)\s*(\?\?|\|\|)\s*0\b|\b(average|rating)\s*:\s*0\b/i;
  const FORBIDDEN_COPY =
    /be the first|no reviews yet|no ratings yet|no rating yet|not yet rated|0\.0 out of|reviews coming soon|\b0 reviews\b/i;

  const zeroOffenders = [];
  const copyOffenders = [];

  for (const file of sourceFiles) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      // Comments are skipped for the same reason check 2 skips them: the
      // rule is quoted verbatim in several of these files, and a comment
      // naming the thing it forbids is a comment doing its job.
      const trimmed = line.trim();
      if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
        return;
      }
      const where = `${show(file)}:${i + 1}  ${trimmed.slice(0, 72)}`;
      if (INVENTED_ZERO.test(line)) zeroOffenders.push(where);
      if (FORBIDDEN_COPY.test(line)) copyOffenders.push(where);
    });
  }

  if (zeroOffenders.length > 0) {
    rule5(
      "a rating defaulting to zero:\n" +
        zeroOffenders.map((o) => `          ${o}`).join("\n"),
    );
  } else if (copyOffenders.length > 0) {
    rule5(
      "empty-state copy that renders the shape of social proof:\n" +
        copyOffenders.map((o) => `          ${o}`).join("\n"),
    );
  } else {
    pass("rule 5: no invented zero and no placeholder review copy");
  }

  // (e) the marks are drawable only from behind the gate
  if (existsSync(marksPath)) {
    const allowed = new Set([gatePath, marksPath, listPath]);
    const offenders = sourceFiles.filter(
      (file) => !allowed.has(file) && /\bRatingMarks\b/.test(readFileSync(file, "utf8")),
    );

    if (offenders.length > 0) {
      rule5(
        "RatingMarks drawn outside the components that gate it:\n" +
          offenders.map((f) => `          ${show(f)}`).join("\n") +
          "\n\n        Mount ProductRating (a rating) or ReviewList (the reviews) instead." +
          "\n        Both return null before they draw anything.",
      );
    } else {
      pass("rule 5: RatingMarks is reachable only through the gate");
    }
  }
}

console.log(failures === 0 ? "\nMobile checks passed." : `\n${failures} failed.`);
process.exit(failures > 0 ? 1 : 0);
