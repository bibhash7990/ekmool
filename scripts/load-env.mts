/**
 * Minimal .env loader for standalone scripts (Next loads .env.local itself,
 * but `node scripts/*.ts` does not go through Next).
 * Precedence: existing process.env > .env.local > .env
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

export function loadEnv(): void {
  parseInto(join(root, ".env.local"));
  parseInto(join(root, ".env"));
}

/**
 * The database provider's CA: `ca.pem` at the repository root if present,
 * otherwise DATABASE_SSL_CA with escaped newlines restored.
 *
 * Same precedence as `dbSslCa` in src/lib/env.ts, and duplicated here
 * rather than imported because that module is `server-only` and these
 * scripts run outside Next entirely.
 *
 * The file is preferred because a PEM survives a file and does not survive
 * a dashboard: Vercel's env editor strips the newlines out of a pasted
 * certificate, and OpenSSL rejects the result.
 */
export function readCa(): string {
  try {
    return readFileSync(join(root, "ca.pem"), "utf8").trim();
  } catch {
    return (process.env.DATABASE_SSL_CA ?? "").replace(/\\n/g, "\n");
  }
}
