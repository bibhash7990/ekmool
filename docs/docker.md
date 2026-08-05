# Running the whole stack in Docker

One command brings up everything — database, schema, catalogue content, the
site build, the web server, and the cron scheduler.

```bash
cp .env.example .env.local
```

```bash
docker compose up -d --build
```

The site is on **http://localhost:3000**. First run takes two to three
minutes, almost all of it `npm ci` and `next build`; afterwards it is about
twenty seconds.

Add the reverse proxy — worth it for anything public-facing, see
[The edge profile](#the-edge-profile):

```bash
docker compose --profile edge up -d --build
```

That serves on **http://localhost:8080**.

---

## What starts, and in what order

| Service | Kind | Does |
|---|---|---|
| `mysql` | long-running | MySQL 8.4, data in the `mysql-data` volume |
| `migrate` | one-shot | `db:migrate` then `db:seed` |
| `builder` | one-shot | `next build`, publishes to the `app-build` volume |
| `app` | long-running | Serves the standalone bundle on :3000 |
| `cron` | long-running | The three scheduled jobs, in IST |
| `nginx` | long-running, `edge` profile only | gzip offload + caching on :8080 |

Each waits for the one before it — `service_healthy` for MySQL,
`service_completed_successfully` for the two one-shots — so the ordering is
enforced by compose rather than by sleeping and hoping.

There is no separate frontend and backend to start. This is one Next.js
application: the pages and the API routes (`/api/checkout`, the Razorpay
webhook, the job endpoints) are the same process, and `app` runs all of it.

## Why the build is a service and not a build stage

`next build` needs a live database. Every product page is statically
generated from MySQL at build time, which is the whole reason the site can
serve thousands of concurrent readers without touching the database
afterwards.

A `docker build` has no route to a compose service, and the usual
workarounds — host networking, baking credentials into build args — are
worse than the problem. So the build runs as an ordinary container on the
same network as MySQL and writes its output to a shared volume that `app`
mounts read-only.

The practical consequence: **every `up` produces a fresh build** against
whatever is currently in the database and in your source. That is usually
what you want, and it costs about fifteen seconds.

---

## Configuration

Compose reads `.env` then `.env.local`, later winning — the same precedence
Next applies, so a value behaves identically under `npm run dev` and in a
container. Three settings are overridden per service because the network
address differs inside:

| Setting | Host | Container |
|---|---|---|
| `DATABASE_HOST` | `127.0.0.1` | `mysql` |
| cron target | `NEXT_PUBLIC_APP_URL` | `CRON_TARGET_URL=http://app:3000` |

`NEXT_PUBLIC_APP_URL` stays your public origin — it is what canonical URLs,
the sitemap, and email links are built from, so it must not be changed to an
internal address.

> **One caveat.** Compose expands `${VAR}` in `docker-compose.yml` from your
> shell and from `.env` — **never** from `.env.local`. That only affects the
> `mysql` service, which needs its credentials when it first initialises. If
> you change `DATABASE_USER` or `DATABASE_PASSWORD`, put them in `.env` too,
> or MySQL will initialise with one password while the app connects with
> another.

Secrets never enter an image. `.dockerignore` excludes `.env*`, so the build
container gets its configuration from compose at runtime and the published
bundle contains no credentials. You can confirm this in the builder log — it
reports `skip .env.local (not present…)`.

**No API keys are required.** Clerk, Razorpay, SMTP, Sentry and PostHog each
degrade to a documented inert state, and Cash on Delivery works end to end
with only MySQL. See [keys-needed.md](keys-needed.md).

---

## The edge profile

nginx does two things: compresses responses so Node does not have to, and
caches prerendered HTML. Load testing had already identified gzip in the
origin process as the largest CPU cost under traffic
([loadtest.md](loadtest.md)), and the difference is not subtle.

Same 500 rps browse load, measured on the same machine:

| | sustained | p50 | p95 |
|---|---:|---:|---:|
| Direct to `app` | 478 rps | 12.0 ms | 1259 ms |
| Through nginx | **500 rps** | **1.1 ms** | **2.1 ms** |

Pushed further, nginx held **1500 rps at p95 3.4 ms with zero failures** —
roughly 30,000 concurrent browsing users at a realistic twenty-second think
time, about three times the design target. At 3000 rps it began refusing
connections, but those were `ECONNREFUSED` at connect time on the Windows
host's Docker port forwarding, not nginx running out of anything.

Cache rules are in [docker/nginx.conf](../docker/nginx.conf). The important
one is that everything touching per-visitor state — `/api`, `/cart`,
`/checkout`, `/order`, `/admin`, `/account` — is never cached, so one
shopper's cart or order can never be served to another.

To scale the origin behind it, comment out the `ports` block on `app` (a
published host port can only be bound once) and:

```bash
docker compose --profile edge up -d --scale app=4
```

Docker's DNS round-robins across the replicas with no nginx change. One Node
process saturates a core at roughly 450 rps, so this is the lever if the
cache hit rate is ever low enough to matter.

---

## Everyday commands

```bash
docker compose logs -f app
```

```bash
docker compose ps
```

Rebuild after changing code — the builder re-runs automatically:

```bash
docker compose up -d --build
```

Stop, keeping data:

```bash
docker compose down
```

Start over completely, discarding the database:

```bash
docker compose down -v
```

There are npm aliases for these: `docker:up`, `docker:edge`, `docker:down`,
`docker:reset`, `docker:logs`, `docker:ps`.

MySQL's port is published to the host so the test suites still work against
the containerised stack:

```bash
npm run test:checkout 3000
```

---

## Deploying this

The same compose file runs on a server. On the target host:

1. Install Docker, clone the repository.
2. Write `.env` with production values — a real `NEXT_PUBLIC_APP_URL`, strong
   `CRON_SECRET`, `REVALIDATE_SECRET` and `SESSION_SECRET`, real database
   credentials, your `SELLER_*` identity if you are GST-registered, and
   whichever service keys you have. Without `SESSION_SECRET` every container
   restart signs every customer out; without the seller identity invoices
   print as pro-forma. Both are covered in [deploy.md](deploy.md).
3. **Remove the `ports` block from `mysql`.** Nothing outside the compose
   network should reach the database. It is published only so local tooling
   works.
4. Use the edge profile, and put TLS in front of nginx — either a
   host-level reverse proxy with certbot, or Cloudflare with the record
   proxied (orange cloud). [deploy.md](deploy.md) has the Cloudflare cache
   rules.

```bash
docker compose --profile edge up -d --build
```

Updating is `git pull` then the same command: the builder regenerates the
site and `app` picks it up. Nothing writes to the app container, so it is
disposable.

For rollbacks and database backups, see the end of [deploy.md](deploy.md).
Migrations only move forward, so take a dump before shipping one that drops
or narrows a column:

```bash
docker compose exec mysql mysqldump -u root -p ekmool > backup-$(date +%F).sql
```

**Cron:** the `cron` service covers the three scheduled jobs. If you deploy
to Vercel instead, `vercel.json` drives the same routes — run one or the
other, never both, or customers get duplicate reminder emails.

---

## Troubleshooting

**`migrate` exits 1 with ECONNREFUSED, but MySQL says healthy.**
This was a real bug in the first version of this setup. A healthcheck of
`mysqladmin ping -h localhost` connects over the unix socket, which answers
during MySQL's first-run initialisation while the TCP listener is still
down — so compose starts the migration too early. The healthcheck now forces
`--protocol=TCP` and authenticates as the app user against the app database,
which also proves both were created.

**`exec docker/build.sh: no such file or directory`, and the file plainly
exists.** The script has CRLF line endings, so the kernel reads the shebang
as `/bin/sh\r`. `.gitattributes` pins `*.sh` to `eol=lf`; if you added a
script another way, convert it.

**Checkout returns 503 `DB_UNAVAILABLE` but browsing is fine.** That is the
designed behaviour when the database is unreachable — pages are prerendered
and keep serving. Check `docker compose logs mysql` and
`curl localhost:3000/api/health`, which reports `db` separately from `ok`.

**The build fails with ECONNREFUSED.** The build genuinely needs MySQL.
Confirm it is healthy (`docker compose ps`) before rebuilding; compose
normally enforces this, so this usually means it was started by hand.

**Port 3000 or 8080 already in use.** Set `APP_PORT` or `EDGE_PORT` in
`.env`.
