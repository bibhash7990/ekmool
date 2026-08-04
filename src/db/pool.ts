import mysql from "mysql2/promise";
import { getDbConfig } from "@/lib/env";

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
