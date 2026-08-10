#!/bin/sh
# Build the site and publish the standalone bundle to the shared volume.
#
# Runs as the `builder` compose service, on the same network as MySQL,
# because `next build` generates every product page from the database.
#
# Output goes to /out, which the app container mounts and serves.
#
# The working directory is the workspace root (/app), not the app — hence
# `pnpm --filter web` for every script and the apps/web/ prefix on the
# build output below.
set -eu

OUT=${OUT_DIR:-/out}

# Where `output: "standalone"` lands. distDir is under the app, so the tree
# is here; its *contents* are laid out from the workspace root, because
# next.config.ts sets outputFileTracingRoot to ../../. That is why the tree
# contains node_modules/ beside apps/web/server.js, and why the app
# container's CMD is `node apps/web/server.js`.
BUNDLE=apps/web/.next/standalone

echo "==> Building Ekmool"
echo "    database : ${DATABASE_HOST:-unset}:${DATABASE_PORT:-3306}"
echo "    app url  : ${NEXT_PUBLIC_APP_URL:-unset}"
echo "    output   : $OUT"

pnpm --filter web build

# Copies .next/static, public/ and (if present) .env.local into the bundle.
# next build recreates that directory every time, so this is not optional —
# without it you get an unstyled page with no hydration.
pnpm --filter web standalone

echo "==> Publishing to $OUT"
mkdir -p "$OUT"

# Replace the contents rather than the directory itself: /out is a mount
# point, so removing it would fail. Clear it first so files deleted between
# builds do not linger and get served.
find "$OUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$BUNDLE"/. "$OUT"/

# The runtime container runs as uid 1001 (nextjs) and only ever reads this.
chown -R 1001:1001 "$OUT"

echo "==> Done. $(du -sh "$OUT" | cut -f1) published."
