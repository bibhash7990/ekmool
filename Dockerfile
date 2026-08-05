# syntax=docker/dockerfile:1.7
#
# One image, three roles. `builder` carries the full toolchain and source and
# is what the migrate / build / cron containers run; `runner` is the lean
# image that actually serves traffic.
#
# Why the build is not baked in here:
#
# Every product page is statically generated from MySQL at build time — that
# is the whole reason this site can serve 10,000 concurrent users without
# touching the database. So `next build` needs a live database, and a plain
# `docker build` has no route to one. Rather than pretend otherwise with
# host-network tricks, the build runs as a compose service that sits on the
# same network as MySQL and writes its output to a shared volume. See
# docker-compose.yml and docs/docker.md.

########################  base  ########################
FROM node:22-alpine AS base

# sharp (pulled in by next/image) needs these on musl.
RUN apk add --no-cache libc6-compat

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

########################  deps  ########################
FROM base AS deps

# Copied on their own so this layer is only invalidated by a dependency
# change, not by every source edit.
COPY package.json package-lock.json ./

# Dev dependencies are required: next, typescript and tailwind all run
# during the build, and this image is what performs it.
RUN npm ci

######################  builder  #######################
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN chmod +x docker/*.sh

# Overridden per service in docker-compose.yml.
CMD ["sh", "docker/build.sh"]

#######################  runner  #######################
# Serves the standalone bundle. Deliberately holds no source and no dev
# dependencies — `.next/standalone` ships its own minimal node_modules.
FROM base AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001 -G nodejs

# The build output arrives on a volume mounted here, written by the builder
# service. Pre-creating it with the right owner means the non-root user can
# read it without a chown on every start.
RUN mkdir -p /app/dist && chown -R nextjs:nodejs /app

USER nextjs
WORKDIR /app/dist

EXPOSE 3000

# Next's own health signal is the app answering; /api/health additionally
# reports whether MySQL is reachable, without ever failing on its account —
# the site is designed to serve pages with the database down.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
