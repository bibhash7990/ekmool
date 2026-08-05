# Ekmool

A direct-to-consumer storefront for five GI-tagged single-origin Indian foods —
Kandhamal and Lakadong turmeric, Mithila makhana, Guntur and Byadagi chilli.
Three pack sizes each, fifteen SKUs.

Next.js 16 · React 19 · Tailwind v4 · MySQL 8 · TypeScript strict

---

## Quick start

**No API keys are required.** The site builds, runs, and takes Cash on
Delivery orders end to end with only a database.

### Everything in Docker — one command

Needs only Docker. Brings up MySQL, the schema, the catalogue content, the
site build, the web server and the cron scheduler:

```bash
cp .env.example .env.local && docker compose up -d --build
```

Then open http://localhost:3000. Add nginx (gzip offload + caching, and a
large difference under load) with `docker compose --profile edge up -d --build`,
which serves on :8080. Details in [docs/docker.md](docs/docker.md).

### Or locally, with Node

Needs Node 22 and Docker for the database:

```bash
npm install && cp .env.example .env.local
```

```bash
npm run db:up && npm run db:migrate && npm run db:seed
```

```bash
npm run dev
```

`.env.local` needs `CRON_SECRET` and `REVALIDATE_SECRET` filled in — any random
hex will do:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

To switch on payments, admin login, email, error tracking or analytics later,
see [docs/keys-needed.md](docs/keys-needed.md). Each is additive: paste the keys,
restart, and that feature turns itself on. Absent, it stays inert — no failed
requests, no console noise, no bytes shipped to the browser.

---

## How it holds up under load

The design constraint was 10,000 concurrent browsing users. At a realistic
20-second think time that is ~500 requests/second, and the way this survives it
is that **browsing never touches the database**.

Every public page is statically generated at build time and revalidated on a
one-hour ISR window. Catalogue reads go through `unstable_cache` tagged
`products`, so the SQL runs about once an hour rather than once a request. The
proxy matcher excludes public pages entirely, so they do not even pay for that
hop. The origin and MySQL are reached only by checkout, order lookup, the
payment webhook, admin, and cron.

Measured, not assumed: a 60-second browse run at 500 rps — roughly 30,000 page
views — issued **~11 MySQL queries in total**. Stopping MySQL mid-flight leaves
every product page returning 200 with its real content, prices and JSON-LD
intact, and zero failed requests.

Correctness under concurrency is enforced in the database rather than in
application logic:

- **No overselling** — `UPDATE ... SET stock_qty = stock_qty - ? WHERE id = ? AND stock_qty >= ?`
  in a transaction. At 50 orders/second against deliberately insufficient stock,
  units sold matched the stock delta per variant exactly and nothing went
  negative.
- **No duplicate orders** — a required `Idempotency-Key` plus a unique index. A
  replay returns the original order rather than creating a second.
- **No double-charging** — `orders.razorpay_payment_id` is unique. 500
  concurrent replays of one webhook produce exactly one state change, one
  history row, one email.

Numbers and method: [docs/loadtest.md](docs/loadtest.md).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run standalone` | Assemble `.next/standalone` (copies static, public, env) |
| `npm run standalone:start` | Run the standalone bundle |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run docker:up` / `docker:edge` | Whole stack, without / with nginx |
| `npm run docker:logs` / `docker:down` / `docker:reset` | Tail, stop, wipe |
| `npm run db:up` / `db:down` | Start/stop the MySQL container |
| `npm run db:migrate` / `db:seed` | Schema and catalogue content |
| `npm run db:reset-stock` | Restore stock after load testing (dev only) |
| `npm run cron` | Run the three scheduled jobs locally |

### Tests

All of these run against a live server and a live database, so start one first
(`npm run standalone:start`, or `npm run dev`).

| Command | Covers |
|---|---|
| `npm run test:checkout` | Idempotency, atomic stock, oversell, webhook signature, rate limiting |
| `npm run test:db-down` | Browsing with MySQL stopped (stop it first) |
| `npm run test:jobs` | Cron authorisation, stale-order cancel, reminder dedupe |
| `npm run validate:schema` | Titles, descriptions, canonicals, JSON-LD, internal links |
| `npm run audit` | Lighthouse gates: SEO 100, Perf ≥90, A11y ≥95, BP ≥95, JS ≤170 KB |
| `npm run loadtest` | k6 browse + checkout load, verified against the database |
| `npm run chaos` | Kills MySQL under live traffic and checks what survives |

`npm run audit` and `npm run loadtest` need Chrome and
[k6](https://k6.io) respectively.

---

## Documentation

| | |
|---|---|
| [docs/docker.md](docs/docker.md) | The one-command stack, the edge profile, deploying it |
| [docs/keys-needed.md](docs/keys-needed.md) | What to sign up for, in what order, and what each unlocks |
| [docs/deploy.md](docs/deploy.md) | Vercel and VPS paths, CDN cache rules, cron, email DNS |
| [docs/audit.md](docs/audit.md) | Lighthouse results and the defects the gates caught |
| [docs/loadtest.md](docs/loadtest.md) | Load, chaos and failure testing |
| [research/stack-research.md](research/stack-research.md) | Version choices and the corrections they forced |

---

## Notes for anyone extending this

- **Brand colours and type live in `src/app/globals.css`** as Tailwind v4
  `@theme` tokens. Use the generated utilities (`bg-ek-paper`,
  `text-ek-green-900`). A hardcoded hex in a component is a review failure.
  Note `--color-ek-gold-800` is the only gold safe as ink on light
  backgrounds — `gold-500`/`gold-600` are for fills and dark grounds.
- **Never call `revalidatePath` on `/products/[slug]`.** It sets
  `dynamicParams = false`, and revalidatePath removes the prerendered entry
  rather than marking it stale, leaving nothing to regenerate from — the page
  404s permanently until a rebuild. Use `revalidateTag(PRODUCTS_TAG)`. This is
  documented at the call site in `src/lib/revalidate.ts` and guarded by
  `npm run chaos`.
- **Never revalidate from the checkout path.** Purging a page discards the copy
  that would otherwise be served during a database outage. Stock display rides
  the hourly window; the atomic decrement is what actually prevents
  overselling.
- **Parameterised SQL only**, secrets only via env.
- **Never fabricate social proof.** There are no ratings, no review counts, and
  scarcity messaging appears only when the stock number is literally true.
