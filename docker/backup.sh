#!/bin/sh
# Nightly database backup, inside a container that has the real mysqldump.
#
# It runs on the mysql:8.4 image rather than the app image, and the reason
# is worth writing down because it looks like an arbitrary choice.
#
# MySQL 8.4 authenticates with caching_sha2_password. Alpine's
# mariadb-client — the only MySQL client Alpine packages, and what
# `apk add mysql-client` actually installs — does not ship
# caching_sha2_password.so, so it cannot connect at all:
#
#   Plugin caching_sha2_password could not be loaded:
#   /usr/lib/mariadb/plugin/caching_sha2_password.so: No such file
#
# That was measured, not assumed. Debian's default-mysql-client is the same
# package under another name. The alternatives were to weaken the database
# user's auth plugin, or to run the dump where a matching client already
# exists. This is the second one, and the image is already pulled.
#
# Scheduling is a sleep loop rather than cron because this image has no
# cron daemon, and installing one to fire a single job once a day would be
# more moving parts than the loop it replaces.

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
AT_HOUR="${BACKUP_AT_HOUR_IST:-3}"

DB_HOST="${DATABASE_HOST:-mysql}"
DB_PORT="${DATABASE_PORT:-3306}"
DB_USER="${DATABASE_USER:-ekmool}"
DB_NAME="${DATABASE_NAME:-ekmool}"

# Through the environment, not on the command line, where `ps` would show
# it to every process in the container.
export MYSQL_PWD="${DATABASE_PASSWORD:-}"

mkdir -p "$BACKUP_DIR"

log() {
  echo "[backup] $(TZ=Asia/Kolkata date '+%Y-%m-%d %H:%M:%S IST') $*"
}

take_backup() {
  stamp=$(TZ=Asia/Kolkata date '+%Y-%m-%d-%H%M')
  target="$BACKUP_DIR/ekmool-$stamp.sql.gz"

  log "dumping $DB_NAME to $target"

  # --single-transaction, not --lock-tables: InnoDB throughout, so a
  # consistent snapshot comes from one transaction rather than from
  # locking the shop out of its own orders table while this runs.
  if ! mysqldump \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --user="$DB_USER" \
        --single-transaction \
        --quick \
        --routines \
        --triggers \
        --events \
        --complete-insert \
        "$DB_NAME" 2>"$BACKUP_DIR/.last-error" | gzip -9 > "$target"; then
    log "FAILED: $(cat "$BACKUP_DIR/.last-error")"
    rm -f "$target"
    return 1
  fi

  # The check that makes this a backup rather than a file.
  #
  # mysqldump's last line is "-- Dump completed on …". A dump without it
  # was truncated — the disk filled, the connection dropped, the container
  # was killed. That file looks entirely fine: right name, plausible size,
  # gzip that opens. It restores as a partial database, and you find out on
  # the day you need it.
  if ! gzip -dc "$target" | tail -5 | grep -q "Dump completed on"; then
    log "FAILED: no completion marker — the dump was truncated. Deleted."
    rm -f "$target"
    return 1
  fi

  # And that it contains a table we know exists, so an empty-but-valid
  # dump of the wrong database does not pass.
  if ! gzip -dc "$target" | grep -q "CREATE TABLE \`orders\`"; then
    log "FAILED: no orders table in the dump. Deleted."
    rm -f "$target"
    return 1
  fi

  size=$(du -h "$target" | cut -f1)
  log "ok — $size, verified"

  # Local retention. Remote retention is deliberately not done here: see
  # docs/deploy.md. A script that deletes backups is a script that can
  # delete backups, and an object-lifecycle rule on the bucket does the
  # same job without that risk.
  removed=$(find "$BACKUP_DIR" -name 'ekmool-*.sql.gz' -mtime "+$KEEP_DAYS" -print -delete | wc -l)
  if [ "$removed" -gt 0 ]; then
    log "pruned $removed local backup(s) older than $KEEP_DAYS days"
  fi
}

if [ "${BACKUP_RUN_ONCE:-0}" = "1" ]; then
  take_backup
  exit $?
fi

log "scheduler up — nightly at 0${AT_HOUR}:00 IST, keeping $KEEP_DAYS days in $BACKUP_DIR"

while true; do
  now_hour=$(TZ=Asia/Kolkata date '+%-H')
  now_min=$(TZ=Asia/Kolkata date '+%-M')

  # Seconds until the next occurrence of AT_HOUR:00 IST.
  wait_hours=$(( (AT_HOUR - now_hour + 24) % 24 ))
  if [ "$wait_hours" -eq 0 ] && [ "$now_min" -gt 0 ]; then
    wait_hours=24
  fi
  sleep_for=$(( wait_hours * 3600 - now_min * 60 ))
  [ "$sleep_for" -lt 60 ] && sleep_for=60

  log "next run in $((sleep_for / 60)) minutes"
  sleep "$sleep_for"

  take_backup || log "continuing despite the failure — the next run will try again"
done
