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

####################  standalone  ######################
# Self-contained image: builds during `docker build` and carries its own
# output. This is what Render (and any other single-image PaaS) needs,
# because there is no shared volume for a separate builder service to
# write into — `runner` above would start with an empty /app/dist.
#
# The constraint in the header still applies: `next build` prerenders every
# product page from MySQL, so this stage needs DATABASE_* at BUILD time, not
# just at run time. On Render that works because the managed database exists
# before the first deploy. The values arrive as build args and are promoted
# to env for the build step only — they are not persisted into the final
# layer, so the image itself carries no credentials.
#
# Compose is unaffected: it names `target: runner` explicitly.
#
# KEEP THESE TWO STAGES LAST. Render's blueprint spec has no field for
# selecting a build target — `dockerTarget` is not real, and passing it
# makes the blueprint invalid — so Render builds whatever stage ends the
# file. Adding a stage below this one would silently ship it instead.
FROM base AS standalone-builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG DATABASE_HOST
ARG DATABASE_PORT
ARG DATABASE_USER
ARG DATABASE_PASSWORD
ARG DATABASE_NAME
ARG DATABASE_SSL
ARG DATABASE_SSL_CA
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_POSTHOG_KEY

ENV DATABASE_HOST=$DATABASE_HOST \
    DATABASE_PORT=$DATABASE_PORT \
    DATABASE_USER=$DATABASE_USER \
    DATABASE_PASSWORD=$DATABASE_PASSWORD \
    DATABASE_NAME=$DATABASE_NAME \
    DATABASE_SSL=$DATABASE_SSL \
    DATABASE_SSL_CA=$DATABASE_SSL_CA \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY

RUN npm run build

####################  standalone  ######################
FROM base AS standalone

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001 -G nodejs

# `output: "standalone"` emits a tree that already contains the minimal
# node_modules it needs, so nothing is installed here.
COPY --from=standalone-builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=standalone-builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=standalone-builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
