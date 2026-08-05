/**
 * Assemble the standalone bundle for local running.
 *
 * `output: "standalone"` emits a self-contained server.js plus a minimal
 * node_modules, but deliberately leaves out three things, and `next build`
 * recreates the directory from scratch every time — so doing this by hand
 * means silently running last build's assets, or none:
 *
 *   .next/static  — hashed JS/CSS. Missing it gives you an unstyled page
 *                   with no hydration and no obvious error.
 *   public/       — brand assets, favicons, robots.txt.
 *   .env.local    — server.js reads env from its own working directory.
 *                   Missing it, the app boots fine and then answers every
 *                   checkout with 503 DB_UNAVAILABLE, because the DB
 *                   variables are simply absent.
 *
 * On a real host the last one comes from the platform's env, not a file;
 * this copy is a local-testing convenience. See docs/deploy.md.
 *
 *   npm run build && npm run standalone && npm run standalone:start
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error(
    "No .next/standalone — is output: 'standalone' set in next.config.ts? Run npm run build first.",
  );
  process.exit(1);
}

const copies = [
  { from: join(root, ".next", "static"), to: join(standalone, ".next", "static"), label: ".next/static" },
  { from: join(root, "public"), to: join(standalone, "public"), label: "public/" },
  { from: join(root, ".env.local"), to: join(standalone, ".env.local"), label: ".env.local", optional: true },
];

for (const { from, to, label, optional } of copies) {
  if (!existsSync(from)) {
    if (optional) {
      console.log(`  skip  ${label} (not present — supply env from the host instead)`);
      continue;
    }
    console.error(`  FAIL  ${label} missing at ${from}`);
    process.exit(1);
  }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`  copied  ${label}`);
}

console.log("\nStandalone bundle ready:  node .next/standalone/server.js");
