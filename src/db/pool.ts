import mysql from "mysql2/promise";
import { dbSsl, dbSslCa, getDbConfig } from "@/lib/env";

/**
 * Shared connection pool singleton. Cached on globalThis so dev HMR does
 * not leak pools. Browsing paths must never reach this module at request
 * time — only checkout/orders/webhook/admin/jobs/health do.
 */

export class DbUnconfiguredError extends Error {
  constructor() {
    super("Database environment variables are not configured");
    this.name = "DbUnconfiguredError";
  }
}

declare global {
  var __ekmoolPool: mysql.Pool | undefined;
}

export function getPool(): mysql.Pool {
  if (globalThis.__ekmoolPool) return globalThis.__ekmoolPool;

  const config = getDbConfig();
  if (!config) throw new DbUnconfiguredError();

  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    // Managed MySQL (Aiven, PlanetScale, RDS) refuses a plaintext
    // connection; the local Docker container has no certificate and
    // refuses a TLS one. So this is opt-in rather than inferred: set
    // DATABASE_SSL=true in the hosted environment and leave it unset in
    // development, where `npm run db:up` is the only database.
    //
    // `minVersion` rather than `rejectUnauthorized: false` — disabling
    // verification would accept any certificate and hand a man in the
    // middle every order and address that crosses this pool.
    //
    // DATABASE_SSL_CA carries the provider's CA when it signs with its own
    // root. Aiven does, and without the PEM the handshake fails outright
    // (HANDSHAKE_SSL_ERROR) rather than falling back to plaintext.
    ...(dbSsl
      ? {
          ssl: {
            minVersion: "TLSv1.2" as const,
            ...(dbSslCa ? { ca: dbSslCa } : {}),
          },
        }
      : {}),
    connectionLimit: 20,
    queueLimit: 100,
    waitForConnections: true,
    connectTimeout: 5_000,
    charset: "utf8mb4_0900_ai_ci",
    supportBigNumbers: true,
    dateStrings: false,
  });

  globalThis.__ekmoolPool = pool;
  return pool;
}

/** Ping with a hard timeout so health checks never hang. */
export async function pingDb(timeoutMs = 1_500): Promise<boolean> {
  try {
    const pool = getPool();
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("db ping timeout")), timeoutMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}
