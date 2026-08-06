# Deploying Ekmool

Three paths.

**Docker Compose** is the one to reach for if you have a server: the whole
stack — database, build, web, cron, reverse proxy — comes up with one
command, and updating is `git pull` plus that same command. It is documented
separately in **[docker.md](docker.md)**; the Cloudflare, email and rollback
sections below still apply to it.

**Vercel** is the shortest path of all if you would rather not run a server.
**A bare VPS with PM2** costs less at steady state and is what the rest of
this document covers alongside Vercel.

Either way the shape is the same: a CDN answers every public page, and the
origin only ever sees checkout, orders, the payment webhook, admin, and cron.
That split is not a performance nicety — it is the reason the site holds up
under load. See [loadtest.md](loadtest.md) for the measurements behind it.

Before either path, get the keys you want switched on:
[keys-needed.md](keys-needed.md). Nothing here requires them — the site
deploys, runs, and takes Cash on Delivery orders with only a database.

---

## Environment variables

Set these on the platform, never in a committed file. `.env.example` lists
every one with comments.

**Required**

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Full public origin, no trailing slash. Canonical URLs, sitemap, OG tags and emails all build from it. Getting this wrong quietly breaks SEO. |
| `DATABASE_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_NAME` | MySQL 8. |
| `CRON_SECRET` | Guards `/api/jobs/*`. Jobs fail closed without it. |
| `REVALIDATE_SECRET` | Guards `/api/revalidate`. |
| `SESSION_SECRET` | Signs the customer session cookie. Omit it and the app generates one per process: every restart signs customers out, and instances cannot read each other's cookies. |
| `ADMIN_EMAIL` | Low-stock reports. |

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Required before you invoice anyone**

| Variable | Notes |
|---|---|
| `SELLER_LEGAL_NAME` · `SELLER_GSTIN` · `SELLER_STATE` · `SELLER_ADDRESS` | All four together, or none. They decide both whether GST is recorded on an order and whether the invoice is a tax invoice — one switch, because an unregistered seller may not collect tax (CGST Act s.32). Unset, no GST is charged and invoices print as pro-forma with no tax columns. `SELLER_STATE` must match a checkout state name exactly; it is what distinguishes CGST + SGST from IGST. |
| `SELLER_FSSAI` | Optional. Printed when set. |

Set these **before** taking orders you intend to invoice. They are
snapshotted onto each order at checkout, so configuring them later does not
backdate: earlier orders stay untaxed and their invoices stay pro-forma,
which is correct, because no GST was collected on them. Details in
[keys-needed.md](keys-needed.md#6-your-own-gst-registration--tax-invoices).

**Optional** — each switches on one feature and is inert when absent:
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`,
`NEXT_PUBLIC_RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET`,
`SMTP_*` + `MAIL_FROM`, `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN` for
source maps), `NEXT_PUBLIC_POSTHOG_KEY`.

> **`NEXT_PUBLIC_*` variables are inlined at build time.** Changing one at
> runtime does nothing — you must rebuild. This catches people out with
> Razorpay and Clerk in particular.

---

## Path A — Vercel

1. Push to GitHub, import the repo. Framework detection handles the rest; no
   build settings to change.
2. Add the environment variables above to Production (and Preview if you want
   previews working against a separate database).
3. Deploy.

**Cron** is already declared in `vercel.json` — hourly abandoned-payment
reminder, daily low-stock report at 02:30 UTC (08:00 IST), daily stale-order
cancel at 03:00 UTC. Vercel Cron calls them over HTTPS; add `CRON_SECRET` as an
env var and Vercel will send it. Verify after the first deploy that all three
appear under Settings → Cron Jobs.

**Database.** Vercel does not host MySQL. Use PlanetScale, Aiven, or a managed
MySQL near your function region — `ap-south-1` (Mumbai) if your buyers are in
India, since every checkout pays that round trip. Set `connectionLimit` low if
your provider caps connections; the pool defaults to 20 per instance and
serverless can multiply instances.

### Cloudflare in front of Vercel — grey-cloud

If your domain is on Cloudflare and you are deploying to Vercel, set the DNS
record to **DNS-only (grey cloud)**, not proxied.

Vercel already runs its own CDN with correct cache headers for ISR. Putting
Cloudflare's proxy in front of it gives you two caches disagreeing about
revalidation, and you get stale product pages that no purge clears predictably.
Point the domain at Vercel and let Vercel's edge do the work.

---

## Path B — VPS with PM2 and Nginx

Assumes Ubuntu, Node 22, MySQL 8 on the same host or a private network.

### Build and run

```bash
npm ci && npm run build && npm run standalone
```

`npm run standalone` copies `.next/static`, `public/`, and `.env.local` into
`.next/standalone/`. `next build` recreates that directory every time, so this
step is not optional — skip it and you get an unstyled page with no hydration,
or an app that boots fine and then answers every checkout with
`503 DB_UNAVAILABLE` because the database variables are simply absent. On a
real host, supply env through PM2 or systemd rather than the file.

**Run one process per core.** A single Node process saturates one core at
around 450 rps of page traffic ([loadtest.md](loadtest.md)); PM2 cluster mode
is the entire fix.

`ecosystem.config.js`:

```js
module.exports = {
  apps: [{
    name: "ekmool",
    script: ".next/standalone/server.js",
    instances: "max",
    exec_mode: "cluster",
    env: { NODE_ENV: "production", PORT: 3000, HOSTNAME: "127.0.0.1" },
  }],
};
```

```bash
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

One caveat: the rate limiter in `src/proxy.ts` keeps its token buckets in
process memory, so in cluster mode each worker enforces its own limit — N
workers means an effective limit of N×. It is written behind a `RateLimiter`
interface for exactly this reason; swap `InMemoryTokenBucket` for a Redis
implementation when you cluster, or accept the looser limit knowingly.

### Nginx

```nginx
server {
  server_name ekmool.com;

  # Compress here, not in Node. Under load, gzip in the origin process is
  # the single largest CPU cost — see loadtest.md.
  gzip on;
  gzip_types text/html text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;

  # Hashed build assets are immutable.
  location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_cache_valid 200 365d;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`X-Real-IP` and `X-Forwarded-For` matter: `clientIp()` in
`src/lib/rate-limit.ts` reads them, and without them every request looks like
it came from `127.0.0.1` and shares one rate-limit bucket.

TLS via `certbot --nginx -d ekmool.com -d www.ekmool.com`.

### Cloudflare in front of a VPS — orange-cloud

Here you **do** want the proxy on, because there is no other CDN. Cache rules:

| Path | Rule |
|---|---|
| `/_next/static/*`, `/brand/*` | Cache everything, edge TTL 1 year |
| `/`, `/products*`, `/blog*`, `/about`, `/faq`, policy pages | Cache everything, edge TTL 1 hour, browser TTL 0 |
| `/api/*`, `/cart`, `/checkout`, `/order/*`, `/orders/*`, `/track`, `/admin*`, `/account*` | **Bypass cache** |

The bypass row is not optional. Caching `/api/checkout` would serve one
buyer's order response to another.

Edge TTL 1 hour matches the ISR `revalidate = 3600` on the catalogue, so the
two layers expire together. After changing stock or publishing content, call
`/api/revalidate` with `x-revalidate-secret` and purge the Cloudflare cache for
the affected paths — Cloudflare has no way to know the origin revalidated.

### Cron

Vercel Cron does not exist here. Either run the bundled scheduler:

```bash
pm2 start "npm run cron" --name ekmool-cron
```

(`node-cron`, `Asia/Kolkata`, same four jobs) — or use system cron:

```bash
0 * * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://ekmool.com/api/jobs/abandoned-payment-reminder
```

```bash
30 * * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://ekmool.com/api/jobs/final-notice
```

Use one or the other. Running both is safe against duplicate emails —
each job claims its order with an atomic UPDATE before sending, so a
second runner finds nothing to claim — but it doubles the load for no
benefit.

---

## Email deliverability — Brevo

Transactional mail from a new domain lands in spam without DNS records. Add
these at your DNS provider, then verify in Brevo:

| Type | Host | Value |
|---|---|---|
| TXT | `@` | `v=spf1 include:spf.brevo.com mx ~all` |
| TXT | `mail._domainkey` | the DKIM value Brevo shows for your domain |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:you@ekmool.com` |

Start DMARC at `p=none` and watch the reports for a couple of weeks before
tightening to `quarantine`. Moving straight to `p=reject` on a domain whose
mail flow you have not observed is how you silently lose order confirmations.

If you already have an SPF record, merge `include:spf.brevo.com` into it —
two SPF records is a permanent failure, not a warning.

---

## Razorpay webhook

In the Razorpay dashboard, add a webhook pointing at
`https://ekmool.com/api/payment/webhook`, subscribe to `payment.captured`,
`order.paid` and `payment.failed`, and set the secret to the same value as
`RAZORPAY_WEBHOOK_SECRET`.

The route verifies HMAC-SHA256 over the **raw** body, so anything between
Razorpay and the origin that rewrites or re-serialises the body will break
signature verification. Keep the Cloudflare rule for `/api/*` on bypass.

Deliveries are idempotent — 500 concurrent replays of one event produce exactly
one state change ([loadtest.md](loadtest.md)) — so Razorpay's retries are safe.

---

## Backups

The `backup` compose service dumps the database nightly at 03:00 IST,
gzips it, **verifies it**, and keeps `BACKUP_KEEP_DAYS` of them (14 by
default) in the `backup-data` volume. At 04:00 the cron container ships
anything new to object storage, if the `S3_*` variables from
`docs/keys-needed.md` are set. With no bucket the backup still happens and
is still verified — it just stays on the machine, which is better than
nothing and worse than off-site.

Three things worth knowing about it.

**It runs on the `mysql:8.4` image, not the app image.** MySQL 8.4
authenticates with `caching_sha2_password`, and Alpine's `mariadb-client` —
which is what `apk add mysql-client` actually installs — does not ship that
plugin, so it cannot connect at all. Debian's `default-mysql-client` is the
same package under another name. The alternative was weakening the database
user's auth plugin, which is not a trade worth making for convenience.

**It verifies before it keeps.** `mysqldump` ends with `-- Dump completed
on …`, and a dump without that line was truncated: the disk filled, the
connection dropped, the container was killed. That file has the right name,
a plausible size and a gzip that opens, and it restores as a partial
database — which you discover on the day you need it. `docker/backup.sh`
checks for the marker and for a table it knows exists, and deletes the
archive if either is missing.

**Remote retention is the bucket's job.** Set a lifecycle rule rather than
letting a script delete backups: a script that deletes backups is a script
that can delete backups, and the day it has a bug is the day you need them.
On R2, bucket → **Settings** → *Object lifecycle rules* → delete objects
under the `backups/` prefix after 90 days. S3 is the same under
*Management → Lifecycle*.

Test the restore. A backup nobody has restored is a hypothesis:

```bash
docker compose run --rm --entrypoint sh -e MYSQL_PWD=$MYSQL_ROOT_PASSWORD backup -c 'f=$(ls -1 /backups/ekmool-*.sql.gz | tail -1); mysql -h mysql -u root -e "DROP DATABASE IF EXISTS restore_test; CREATE DATABASE restore_test"; gzip -dc "$f" | mysql -h mysql -u root restore_test; mysql -h mysql -u root -e "SELECT COUNT(*) FROM restore_test.products"'
```

---

## Staging

```bash
npm run docker:staging
```

An override on the production compose file rather than a second file, so
the two cannot drift: everything not named in `docker-compose.staging.yml`
is production's definition. It gets its own database volume, its own ports
(8081 and 3307 by default), nginx always on rather than behind the edge
profile, and two-day backup retention.

nginx always on matters more than it sounds. Production runs behind it, so
staging must too, or the thing staging tests is not the thing that ships.
And with the app port unpublished there, staging is the only place you find
out whether `--scale app=4` actually works before production asks.

---

## Uptime monitoring

A hosted monitor is the better answer for most shops, for one reason: it
notices when the whole machine is gone, which a process on that machine
cannot. UptimeRobot's free tier polls every five minutes and is enough.
Point it at `/api/health`.

If you want one that reads the payload rather than only the status code:

```bash
UPTIME_WEBHOOK_URL=https://hooks.slack.com/... npm run uptime -- https://ekmool.com
```

Three rules it works to. **`ok` is the page, not the dependencies** — the
endpoint reports `ok: true` while the database is down, because browsing is
served from static output and customers are unaffected, so a degraded
dependency is logged and never wakes anyone. **It alerts on the
transition**, once down and once back, rather than every sixty seconds for
four hours. And it wants **two consecutive failures** before saying
anything, because one timeout is a network blip and paging on it is how
people learn to distrust the alarm.

---

## After the first deploy

- `curl https://ekmool.com/api/health` → `{"ok":true,"db":"up","redis":"up"}`
  — and `rateLimiter` must read `redis` on anything running more than one
  replica, or the limits are per-process and four times looser than they
  look
- Hit it twice behind a load balancer and confirm `instance` changes
- `curl -sI https://ekmool.com/sw.js` returns JavaScript, and Chrome offers
  to install the site from the address bar
- `https://ekmool.com/sitemap.xml` lists 18 URLs with the right origin (if
  they say `localhost`, `NEXT_PUBLIC_APP_URL` is wrong)
- `npm run audit` against the deployed origin
- Place one real Cash on Delivery order and confirm the row in `orders`
- Submit the sitemap in Google Search Console

## Rolling back

Vercel: promote the previous deployment from the dashboard — instant, no
rebuild.

VPS: `pm2 reload` against the previous release directory. Keep the last two
builds on disk so this is a symlink swap rather than a rebuild under pressure.

**Database migrations are not automatically reversible.** `scripts/db-migrate.mts`
tracks applied files in a `_migrations` table and only ever moves forward.
Before shipping a migration that drops or narrows a column, take a dump:

```bash
docker exec ekmool-mysql mysqldump -u root -p ekmool > backup-$(date +%F).sql
```
