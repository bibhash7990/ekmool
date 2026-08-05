#!/bin/sh
# Build the site and publish the standalone bundle to the shared volume.
#
# Runs as the `builder` compose service, on the same network as MySQL,
# because `next build` generates every product page from the database.
#
# Output goes to /out, which the app container mounts and serves.
set -eu

OUT=${OUT_DIR:-/out}

echo "==> Building Ekmool"
echo "    database : ${DATABASE_HOST:-unset}:${DATABASE_PORT:-3306}"
echo "    app url  : ${NEXT_PUBLIC_APP_URL:-unset}"
echo "    output   : $OUT"

npm run build

# Copies .next/static, public/ and (if present) .env.local into
# .next/standalone. next build recreates that directory every time, so this
# is not optional — without it you get an unstyled page with no hydration.
npm run standalone

echo "==> Publishing to $OUT"
mkdir -p "$OUT"

# Replace the contents rather than the directory itself: /out is a mount
# point, so removing it would fail. Clear it first so files deleted between
# builds do not linger and get served.
find "$OUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a .next/standalone/. "$OUT"/

# The runtime container runs as uid 1001 (nextjs) and only ever reads this.
chown -R 1001:1001 "$OUT"

echo "==> Done. $(du -sh "$OUT" | cut -f1) published."
