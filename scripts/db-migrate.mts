/**
 * Migration runner. Applies src/db/migrations/*.sql in filename order and
 * records each in `_migrations` so re-runs are no-ops.
 *
 * Run with: npm run db:migrate  (Node 22 strips the TS types natively —
 * keep this file to erasable syntax and relative imports only.)
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "src", "db", "migrations");

async function main(): Promise<void> {
  loadEnv();

  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    user: process.env.DATABASE_USER ?? "ekmool",
    password: process.env.DATABASE_PASSWORD ?? "",
    database: process.env.DATABASE_NAME ?? "ekmool",
    multipleStatements: true,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
        filename   VARCHAR(200) NOT NULL,
        applied_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_migrations_filename (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [rows] = await connection.query("SELECT filename FROM _migrations");
    const applied = new Set(
      (rows as Array<{ filename: string }>).map((r) => r.filename),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip  ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await connection.query(sql);
      await connection.query("INSERT INTO _migrations (filename) VALUES (?)", [
        file,
      ]);
      console.log(`  apply ${file}`);
      count += 1;
    }

    console.log(
      count === 0
        ? "Migrations up to date."
        : `Applied ${count} migration(s).`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
