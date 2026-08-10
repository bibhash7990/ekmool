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
 * Where things land: `outputFileTracingRoot` in next.config.ts points at the
 * workspace root, so the traced node_modules sit at
 * `.next/standalone/node_modules` while the server and its chunks sit one
 * level down at `.next/standalone/apps/web/`. The three copies below follow
 * the server down there. Their *sources* are unchanged — they are relative
 * to apps/web, which is the working directory under
 * `pnpm --filter web standalone`.
 *
 *   pnpm --filter web build && pnpm --filter web standalone && pnpm --filter web standalone:start
 */
import {
  cpSync,
  existsSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();

// Every path below is resolved from the working directory, and since the
// move that directory has to be apps/web. Run from the workspace root and
// the next failure is "No .next/standalone — run build first", which is a
// lie: the build ran, it just ran somewhere else. Check for the one file
// that identifies the app directory and say so, before anything is copied
// or any destination removed.
if (!existsSync(join(root, "next.config.ts"))) {
  console.error(
    `No next.config.ts in ${root} — run this from apps/web (pnpm --filter web standalone).`,
  );
  process.exit(1);
}

const standalone = join(root, ".next", "standalone");
// The server and everything that must sit beside it. See the header.
const appOut = join(standalone, "apps", "web");

if (!existsSync(standalone)) {
  console.error(
    "No .next/standalone — is output: 'standalone' set in next.config.ts? Run pnpm --filter web build first.",
  );
  process.exit(1);
}

const copies = [
  { from: join(root, ".next", "static"), to: join(appOut, ".next", "static"), label: ".next/static" },
  { from: join(root, "public"), to: join(appOut, "public"), label: "public/" },
  { from: join(root, ".env.local"), to: join(appOut, ".env.local"), label: ".env.local", optional: true },
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

/**
 * Repair the symlinks Next's file tracer copied wrong on Windows.
 *
 * pnpm keeps every real package in node_modules/.pnpm and links to it; the
 * tracer reproduces those links in .next/standalone. On Windows, Node picks
 * a symlink's *type* by looking at the target, and defaults to "file" when
 * the target is not there yet — which it often is not, because the tracer
 * has no reason to write a link's target before the link. The result is a
 * file symlink pointing at a directory:
 *
 *   lstat    → says symlink, fine
 *   readlink → returns the target, fine
 *   realpath → EPERM: operation not permitted, stat …/next@16.3.0_…/node_modules/react
 *
 * Node's module resolver calls realpath, so server.js dies at boot, before
 * it binds a port and before any of this project's own code runs. Nothing
 * in the build reports a problem.
 *
 * Linux is unaffected, so this would have stayed invisible: the Docker
 * image and CI stay green while every developer on Windows loses
 * standalone:start, and with it the way all thirteen suites are run
 * locally.
 *
 * A junction is the fix rather than a re-issued symlink: it needs no
 * privilege, it always resolves, and it does not depend on the target
 * existing at the moment it is created. Verified by hand before this was
 * written — realpath goes from EPERM to the resolved path.
 *
 * `node-linker=hoisted` was tried first and does not help: pnpm keeps the
 * .pnpm store and its links whatever the linker is. See .npmrc.
 */
function repairWindowsSymlinks(dir) {
  if (process.platform !== "win32") return 0;

  let repaired = 0;
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = join(current, entry.name);

      if (entry.isSymbolicLink()) {
        try {
          realpathSync(full);
          continue; // already resolvable — leave it alone
        } catch {
          // Fall through and re-create it as a junction.
        }
        try {
          const target = resolve(dirname(full), readlinkSync(full));
          unlinkSync(full);
          symlinkSync(target, full, "junction");
          repaired += 1;
        } catch {
          // A link we cannot repair is left as it was. Failing here would
          // turn a partial problem into no bundle at all, and the boot
          // error names the exact path anyway.
        }
        continue;
      }

      // Do not descend through links; only real directories.
      if (entry.isDirectory()) stack.push(full);
    }
  }

  return repaired;
}

const repaired = repairWindowsSymlinks(join(standalone, "node_modules"));
if (repaired > 0) {
  console.log(`  fixed   ${repaired} Windows symlink(s) → junction`);
}

console.log("\nStandalone bundle ready:  node .next/standalone/apps/web/server.js");
