# syntax=docker/dockerfile:1.7
#
# One image, three roles. `builder` carries the full toolchain and source and
# is what the migrate / build / cron containers run; `runner` is the lean
# image that actually serves traffic.
#
# This is a pnpm + Turborepo workspace. The build context is the repository
# root, so /app in every stage is the *workspace* root and the Next.js app
# lives at /app/apps/web. Almost every path below depends on knowing which of
# those two roots is meant; where it is not obvious, the comment says.
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

# corepack asks for confirmation before it fetches a package manager it has
# not seen. It only prompts on a TTY, so `docker build` is safe — but the
# builder image also runs pnpm at container start (docker/*.sh, the cron
# service), and `docker compose run` does attach one. A prompt there is a
# container that hangs instead of failing.
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

########################  deps  ########################
FROM base AS deps

# Manifests only, so this layer is invalidated by a dependency change and not
# by every source edit. In a workspace that means the root's five files plus
# every member's package.json: pnpm resolves the whole workspace graph in one
# pass and `--frozen-lockfile` fails outright if a member the lockfile knows
# about is not on disk. `packages/` is empty in Phase 0 — the first package
# added there needs a COPY line of its own here.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/web/package.json ./apps/web/

# Dev dependencies are required: next, typescript and tailwind all run during
# the build, and this image is what performs it. pnpm installs them by
# default, so there is deliberately no flag — `--prod` here would produce an
# image that cannot build the thing it exists to build.
#
# corepack rather than `npm i -g pnpm`: it pins the version in the root
# package.json's `packageManager` field, so the image installs with exactly
# the pnpm that wrote the lockfile.
RUN corepack enable && pnpm install --frozen-lockfile

######################  builder  #######################
FROM base AS builder

# Both node_modules trees, not just the root one. pnpm's isolated linker
# (.npmrc: node-linker=isolated) keeps the real packages in the workspace
# root's node_modules/.pnpm and gives each workspace member a directory of
# *relative* symlinks into it. Copy only the root and apps/web resolves
# nothing — not even `next`. The links survive the copy because both trees
# land at the same paths they occupied in `deps`.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# Repeated from `deps` on purpose: this stage is FROM base, not FROM deps, so
# it inherits the copied node_modules but none of corepack's shims. The
# docker/*.sh scripts and the cron service all invoke pnpm.
#
# `pnpm --version` is not a sanity check, it is the download. corepack's shim
# fetches the pinned pnpm the first time it is called, and unlike the other
# stages nothing here runs pnpm during the build — so without this line every
# migrate/build/cron container would go to the network at startup, and an
# offline host would see the stack fail at `docker compose up` rather than at
# `docker build`.
RUN corepack enable && pnpm --version && chmod +x docker/*.sh

# Overridden per service in docker-compose.yml.
CMD ["sh", "docker/build.sh"]

#######################  runner  #######################
# Serves the standalone bundle. Deliberately holds no source and no dev
# dependencies — the standalone tree ships its own minimal node_modules.
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

# One level down since the monorepo move. What docker/build.sh publishes to
# this volume is the standalone tree, and that tree is laid out from the
# *workspace* root — node_modules/ sits beside apps/web/server.js — because
# next.config.ts sets outputFileTracingRoot to the workspace. WORKDIR is the
# volume, so the entry point is apps/web/server.js, not server.js.
CMD ["node", "apps/web/server.js"]

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

# Same two-tree copy as `builder`, for the same isolated-linker reason.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

RUN corepack enable

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

# Not `turbo build`: turbo.json marks the web build `cache: false` anyway
# (its output depends on the catalogue in MySQL), so the task graph buys
# nothing here and pnpm's filter is one less thing between Render's log and
# the actual failure.
RUN pnpm --filter web build

####################  standalone  ######################
FROM base AS standalone

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser -S nextjs -u 1001 -G nodejs

# `output: "standalone"` emits a tree that already contains the minimal
# node_modules it needs, so nothing is installed here.
#
# Two roots meet in these three lines, and confusing them is the classic way
# to break this file. `distDir` is still under the app, so the tree itself is
# emitted at /app/apps/web/.next/standalone — but its *contents* are laid out
# relative to outputFileTracingRoot, which next.config.ts points at the
# workspace root. So inside the tree:
#
#     node_modules/            traced deps, hoisted at the workspace root
#     apps/web/server.js       the entry point, one level down
#     apps/web/.next/          the server chunks with it
#
# Copying it to ./ therefore lands server.js at /app/apps/web/server.js.
# `static` and `public` are never traced into that tree — they are served,
# not required — and both live under the app, so they are copied from
# /app/apps/web/… to the matching place beside server.js.
COPY --from=standalone-builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=standalone-builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=standalone-builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
