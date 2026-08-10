/**
 * Emits `dist/theme.css` — the Tailwind v4 `@theme` block — from
 * `src/tokens.ts`.
 *
 *   pnpm --filter @ekmool/tokens emit     write the file
 *   pnpm --filter @ekmool/tokens check    fail if the file is stale
 *
 * The generated file is committed. That is deliberate: the web build then
 * has no code-generation step, `next build` reads a stylesheet that is just
 * there, and Vercel needs no extra command. The cost of committing a
 * generated file is that it can go stale, and `--check` is what stops it —
 * it regenerates into memory and compares, so CI fails on the commit that
 * edited a token without re-running the emitter, rather than three weeks
 * later on a phone.
 *
 * Node 22 strips TypeScript types natively, so this plain .mjs imports the
 * .ts source directly. No build step, no duplicated copy of the values.
 *
 * The import is a namespace import on purpose: `tokens.type` is one of the
 * exports, and `import { type } from "…"` is type-only-import syntax in
 * TypeScript. It happens to parse as an ordinary named import in a .mjs
 * file, but a reader has to stop and work that out, and the next person to
 * move this line into a .ts file would find it silently importing nothing.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as tokens from "../src/tokens.ts";

const OUT_DIR = join(import.meta.dirname, "..", "dist");
const OUT_FILE = join(OUT_DIR, "theme.css");

/** `green950` → `green-950`, `paper` → `paper`. */
function cssColorName(key) {
  return `--color-ek-${key.replace(/([a-z])(\d)/, "$1-$2")}`;
}

/** `#10241b` → `16 36 27`, the space-separated channels modern `rgb()` takes. */
function channels(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`;
}

/** `0` stays unitless — `0px` is legal but is not what the block has said for a year. */
function px(value) {
  return value === 0 ? "0" : `${value}px`;
}

function renderShadow(layers) {
  return layers
    .map(
      (l) =>
        `${px(l.x)} ${px(l.y)} ${px(l.blur)} rgb(${channels(tokens.color[l.color])} / ${l.alpha})`,
    )
    .join(", ");
}

function build() {
  const lines = [];

  lines.push("/*");
  lines.push("  GENERATED FILE — do not edit by hand.");
  lines.push("");
  lines.push("  Source:  packages/tokens/src/tokens.ts");
  lines.push("  Command: pnpm --filter @ekmool/tokens emit");
  lines.push("");
  lines.push("  Every value below, and the reasoning behind it — including the");
  lines.push("  measured contrast ratios that make gold-800 the only gold safe as");
  lines.push("  ink on a light ground — lives in the source file. Change it there");
  lines.push("  and re-run the command; `pnpm --filter @ekmool/tokens check` fails");
  lines.push("  if this file and that one disagree.");
  lines.push("");
  lines.push("  It is committed so the web build needs no code-generation step.");
  lines.push("*/");
  lines.push("@theme {");

  lines.push("  /* ---- Brand palette (Section 2.2) ---- */");
  for (const [key, hex] of Object.entries(tokens.color)) {
    lines.push(`  ${cssColorName(key)}: ${hex};`);
  }

  lines.push("");
  lines.push("  /* ---- Type scale: 15 / 17 / 20 / 26 / 34 / 46 / 64. Nothing below 15. ---- */");
  for (const [key, { size, lineHeight }] of Object.entries(tokens.type)) {
    const name = `--text-${key.replace(/^t/, "")}`;
    // 1rem = 16px. All seven divide exactly, so there is no rounding here.
    lines.push(`  ${name}: ${size / 16}rem;`);
    lines.push(`  ${name}--line-height: ${lineHeight};`);
  }

  lines.push("");
  lines.push("  /* ---- Shadows: nothing heavier than these two (Section 5) ---- */");
  for (const [key, layers] of Object.entries(tokens.shadow)) {
    lines.push(`  --shadow-${key}: ${renderShadow(layers)};`);
  }

  lines.push("");
  lines.push("  /* ---- Motion ---- */");
  for (const [key, points] of Object.entries(tokens.ease)) {
    lines.push(`  --ease-${key}: cubic-bezier(${points.join(", ")});`);
  }

  lines.push("}");

  // LF, and a trailing newline. The repo is LF throughout; emitting CRLF on
  // a Windows machine would make --check fail for everyone else.
  return lines.join("\n") + "\n";
}

const css = build();
const check = process.argv.includes("--check");

if (!check) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, css, "utf8");
  console.log(`emit-css: wrote ${OUT_FILE} (${css.length} bytes)`);
  process.exit(0);
}

let onDisk;
try {
  onDisk = readFileSync(OUT_FILE, "utf8");
} catch {
  console.error(
    `emit-css --check: packages/tokens/dist/theme.css is missing.\n` +
      `Run: pnpm --filter @ekmool/tokens emit`,
  );
  process.exit(1);
}

if (onDisk === css) {
  console.log("emit-css --check: dist/theme.css is up to date.");
  process.exit(0);
}

// Name the first difference. "The file is stale" sends someone diffing by
// eye; a line number and both sides is the whole answer.
const want = css.split("\n");
const have = onDisk.split("\n");
const i = want.findIndex((line, n) => line !== have[n]);
console.error(
  `emit-css --check: packages/tokens/dist/theme.css is stale — it does not\n` +
    `match what src/tokens.ts generates.\n\n` +
    `  first difference at line ${i + 1}\n` +
    `    on disk:   ${JSON.stringify(have[i] ?? "<end of file>")}\n` +
    `    generated: ${JSON.stringify(want[i] ?? "<end of file>")}\n\n` +
    `Run: pnpm --filter @ekmool/tokens emit  (and commit the result)`,
);
process.exit(1);
