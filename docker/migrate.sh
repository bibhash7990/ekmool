#!/bin/sh
# Schema + catalogue content. Runs once per `docker compose up`, before the
# build, because the build reads the catalogue it creates.
#
# Both steps are idempotent by design: db-migrate tracks applied files in a
# _migrations table, and db-seed upserts on natural keys and never
# overwrites stock, so re-running against a live shop cannot destroy
# inventory.
set -eu

echo "==> Migrating ${DATABASE_NAME:-ekmool} at ${DATABASE_HOST:-unset}"
npm run db:migrate

if [ "${SKIP_SEED:-0}" = "1" ]; then
  echo "==> SKIP_SEED=1, leaving catalogue content alone"
else
  echo "==> Seeding catalogue"
  npm run db:seed
fi

echo "==> Database ready"
