/**
 * Minimal .env loader for standalone scripts (Next loads .env.local itself,
 * but `node scripts/*.ts` does not go through Next).
 *
 * Precedence: existing process.env
 *             > apps/web/.env.local > <repo>/.env.local
 *             > apps/web/.env       > <repo>/.env
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Both resolved from the script's own location rather than process.cwd():
 * these scripts run as `pnpm --filter web db:migrate` (cwd apps/web), under
 * PM2, and out of a cron entry, and they have to read the same files in all
 * three.
 */
const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");

function parseInto(file: string): void {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * The app directory first, the repository root second.
 *
 * `next dev` and `next build` read `.env.local` relative to the app root, so
 * after the monorepo move a developer's copy belongs at
 * `apps/web/.env.local` (`cp .env.example apps/web/.env.local`). These
 * scripts must agree with Next about which file configures the app, or
 * `db:migrate` seeds one database while the site reads another.
 *
 * The repo-root copy is the pre-monorepo location. It is still read, because
 * working trees and deployed checkouts that predate the move still have one
 * there and a script that silently connects to defaults instead is a worse
 * failure than a stale file. parseInto never overwrites a key that is
 * already set, so the app copy wins wherever both exist. Drop these two
 * fallback lines once no checkout has a root `.env.local` left.
 */
export function loadEnv(): void {
  parseInto(join(APP_ROOT, ".env.local"));
  parseInto(join(REPO_ROOT, ".env.local"));
  parseInto(join(APP_ROOT, ".env"));
  parseInto(join(REPO_ROOT, ".env"));
}

/**
 * The database provider's CA: `ca.pem` if it is on disk, otherwise
 * DATABASE_SSL_CA with escaped newlines restored.
 *
 * Duplicated rather than imported from src/lib/env.ts because that module is
 * `server-only` and these scripts run outside Next entirely.
 *
 * Both roots are tried for the same reason as `.env.local` above, and the
 * order is the same: src/lib/env.ts resolves the file from the Next
 * process's cwd, which is now the app directory, while the committed
 * certificate is still at the repository root (it is the one `!ca.pem`
 * exception in .gitignore). Looking in one place only would mean the scripts
 * and the app disagreeing about whether TLS has a CA.
 *
 * The file is preferred over the variable because a PEM survives a file and
 * does not survive a dashboard: Vercel's env editor strips the newlines out
 * of a pasted certificate, and OpenSSL rejects the result.
 */
export function readCa(): string {
  for (const dir of [APP_ROOT, REPO_ROOT]) {
    try {
      return readFileSync(join(dir, "ca.pem"), "utf8").trim();
    } catch {
      /* not here — try the next root, then fall back to the variable */
    }
  }
  return (process.env.DATABASE_SSL_CA ?? "").replace(/\\n/g, "\n");
}
