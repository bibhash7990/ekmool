/**
 * Nightly database backup.
 *
 *   npm run backup                  dump, verify, upload, prune
 *   npm run backup -- --upload-only upload whatever is already in BACKUP_DIR
 *
 * Dumps MySQL, gzips it, checks the result is a whole file, writes it to
 * BACKUP_DIR, and uploads it to object storage when that is configured.
 *
 * Two entry points because there are two deployments. On a VPS or under
 * PM2, `mysqldump` is on the host and this script does everything. Under
 * Docker it cannot: MySQL 8.4 authenticates with caching_sha2_password and
 * Alpine's only MySQL client does not ship that plugin (measured — see
 * docker/backup.sh, which is why the dump runs on the mysql:8.4 image
 * instead). There, the dump is already on a shared volume and this script
 * is invoked with --upload-only to ship it.
 *
 * Three decisions worth knowing about.
 *
 * **It verifies before it keeps.** mysqldump writes "Dump completed on …"
 * as its last line, and a dump without it is truncated — the disk filled,
 * the connection dropped, the container was killed mid-write. That file
 * looks fine: right name, plausible size, gzip that opens. It restores as
 * a partial database. The check below is two lines and is the difference
 * between a backup and a file.
 *
 * **`--single-transaction`, and no `--lock-tables`.** InnoDB throughout, so
 * a consistent snapshot comes from a transaction rather than from locking
 * the shop out of its own orders table for the duration.
 *
 * **Remote retention is the bucket's job, not this script's.** Local files
 * are pruned here because nothing else will. Remote ones are left to an
 * object-lifecycle rule, which R2 and S3 both do properly: a script that
 * deletes backups is a script that can delete backups, and the day it has
 * a bug is the day you need them. See docs/deploy.md for the rule.
 *
 * The password is passed through MYSQL_PWD rather than -p on the command
 * line, where it would be visible to `ps` for every process on the host.
 */
import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./load-env.mts";

loadEnv();

const BACKUP_DIR = process.env.BACKUP_DIR ?? join(process.cwd(), "backups");
const KEEP_DAYS = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS ?? 14));

const DB = {
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: process.env.DATABASE_PORT ?? "3306",
  user: process.env.DATABASE_USER ?? "ekmool",
  password: process.env.DATABASE_PASSWORD ?? "",
  name: process.env.DATABASE_NAME ?? "ekmool",
};

/** IST, because the shop's day is an Indian day and so is its backup. */
function stamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}-${get("hour")}${get("minute")}`;
}

/**
 * Reads the gzip back and answers three questions: does it decompress, does
 * it contain the tables we expect, and does it end where mysqldump says a
 * dump ends.
 */
function verify(path, expectedTables) {
  return new Promise((resolve, reject) => {
    let text = "";
    let bytes = 0;

    createReadStream(path)
      .pipe(createGunzip())
      .on("data", (chunk) => {
        bytes += chunk.length;
        text += String(chunk);
        // The interesting parts are the CREATE TABLE statements near the
        // front and the completion marker at the very end. Keeping the
        // whole dump in memory would defeat the point on a large database.
        if (text.length > 2_000_000) {
          text = text.slice(0, 1_000_000) + text.slice(-500_000);
        }
      })
      .on("end", () => {
        const missing = expectedTables.filter(
          (table) => !text.includes(`CREATE TABLE \`${table}\``),
        );
        resolve({
          bytes,
          complete: /Dump completed on/.test(text),
          missing,
        });
      })
      .on("error", reject);
  });
}

async function upload(path, key) {
  const { presignPut, hasObjectStorage } = await import("@/lib/storage");
  if (!hasObjectStorage) {
    console.log("  no object storage configured — the copy is local only");
    return false;
  }

  const ticket = presignPut({
    key,
    contentType: "application/gzip",
    expiresInSeconds: 3600,
  });
  if (!ticket) {
    console.error("  could not sign the upload");
    return false;
  }

  const body = await import("node:fs/promises").then((fs) => fs.readFile(path));
  const response = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/gzip" },
    body,
  });

  if (!response.ok) {
    console.error(`  upload failed: HTTP ${response.status}`);
    return false;
  }

  console.log(`  uploaded to ${key}`);
  return true;
}

function prune() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  let removed = 0;

  if (!existsSync(BACKUP_DIR)) return;

  for (const name of readdirSync(BACKUP_DIR)) {
    if (!name.startsWith("ekmool-") || !name.endsWith(".sql.gz")) continue;
    const path = join(BACKUP_DIR, name);
    if (statSync(path).mtimeMs < cutoff) {
      unlinkSync(path);
      if (existsSync(`${path}.uploaded`)) unlinkSync(`${path}.uploaded`);
      removed += 1;
    }
  }

  if (removed > 0) {
    console.log(`  pruned ${removed} local backup(s) older than ${KEEP_DAYS} days`);
  }
}

/**
 * Ships anything in BACKUP_DIR that has not gone yet.
 *
 * "Not yet" is tracked with an empty `.uploaded` sidecar next to each
 * archive. A marker file rather than a manifest, because a manifest is one
 * more thing that can disagree with the directory: if the sidecar is
 * there, that exact file went, and if somebody deletes it the worst case
 * is one redundant upload.
 */
async function uploadPending() {
  if (!existsSync(BACKUP_DIR)) {
    console.log(`${BACKUP_DIR} does not exist — nothing to upload`);
    return;
  }

  const archives = readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith("ekmool-") && name.endsWith(".sql.gz"))
    .sort();

  let shipped = 0;
  for (const name of archives) {
    const path = join(BACKUP_DIR, name);
    const marker = `${path}.uploaded`;
    if (existsSync(marker)) continue;

    console.log(`Uploading ${name}`);
    if (await upload(path, `backups/${name}`)) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(marker, "");
      shipped += 1;
    }
  }

  console.log(
    shipped === 0
      ? "Nothing new to upload."
      : `Uploaded ${shipped} backup(s).`,
  );
}

async function main() {
  if (process.argv.includes("--upload-only")) {
    await uploadPending();
    prune();
    return;
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  const name = `ekmool-${stamp()}.sql.gz`;
  const path = join(BACKUP_DIR, name);
  const startedAt = Date.now();

  console.log(`Backing up ${DB.name} to ${path}`);

  // mysqldump | gzip, as two processes with a pipe, so nothing buffers the
  // whole dump in this process's memory.
  const dump = spawn(
    "mysqldump",
    [
      `--host=${DB.host}`,
      `--port=${DB.port}`,
      `--user=${DB.user}`,
      // InnoDB: a consistent snapshot from one transaction, without
      // locking the shop out of its own tables while it runs.
      "--single-transaction",
      "--quick",
      "--routines",
      "--triggers",
      "--events",
      // Off. It writes a CHANGE MASTER comment carrying binlog
      // coordinates, which is noise for a restore of a single instance.
      "--skip-dump-date=false",
      // Column names in every INSERT. Larger file, and a dump that still
      // restores after somebody adds a column.
      "--complete-insert",
      DB.name,
    ],
    {
      // Not -p on the command line, where `ps` shows it to every process
      // on the host.
      env: { ...process.env, MYSQL_PWD: DB.password },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const gzip = spawn("gzip", ["-9"], { stdio: ["pipe", "pipe", "pipe"] });
  const out = (await import("node:fs")).createWriteStream(path);

  dump.stdout.pipe(gzip.stdin);
  gzip.stdout.pipe(out);

  let dumpError = "";
  dump.stderr.on("data", (chunk) => {
    dumpError += String(chunk);
  });

  await new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
    dump.on("error", reject);
    dump.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`mysqldump exited ${code}: ${dumpError.trim()}`));
      }
    });
  });

  const expected = [
    "products",
    "product_variants",
    "orders",
    "order_items",
    "customers",
    "coupons",
    "reviews",
    "admin_audit_log",
  ];
  const result = await verify(path, expected);

  if (!result.complete) {
    unlinkSync(path);
    throw new Error(
      "the dump has no completion marker — it was truncated, and a truncated backup that looks fine is worse than none. Deleted.",
    );
  }
  if (result.missing.length > 0) {
    unlinkSync(path);
    throw new Error(
      `the dump is missing tables: ${result.missing.join(", ")}. Deleted.`,
    );
  }

  const mb = (statSync(path).size / 1024 / 1024).toFixed(2);
  console.log(
    `  ${mb} MB compressed, ${(result.bytes / 1024 / 1024).toFixed(2)} MB of SQL, all ${expected.length} tables present`,
  );

  await upload(path, `backups/${name}`);
  prune();

  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((error) => {
  console.error("Backup FAILED:", error.message);
  // Non-zero, so cron mails it, a supervisor restarts nothing, and a
  // monitor notices. A backup that fails quietly is the worst outcome
  // available — you find out on the day you need it.
  process.exit(1);
});
