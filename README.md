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

`.env.local` needs `CRON_SECRET`, `REVALIDATE_SECRET` and `SESSION_SECRET`
filled in — any random hex will do, one value each:

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
| `npm run test:account` | Order lookup, enumeration resistance, session scoping, cancellation, the account area |
| `npm run test:commerce` | GST arithmetic and the split, invoice numbering, returns windows, re-order, prefill |
| `npm run test:consent` | Security headers, that nothing tracks before consent, the grievance notice, the honeypot |
| `npm run test:db-down` | Browsing with MySQL stopped (stop it first) |
| `npm run test:jobs` | Cron authorisation, stale-order cancel, reminder dedupe |
| `npm run validate:schema` | Titles, descriptions, canonicals, JSON-LD, internal links |
| `npm run audit` | Lighthouse gates: SEO 100, Perf ≥90, A11y ≥95, BP ≥95, JS ≤190 KB |
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
- **There is no registration, and there must never be one.** A customer row
  is created implicitly at checkout by upserting on email
  (`upsertCustomerTx`), and a customer proves an order is theirs at `/track`
  with the reference plus that email. The signed cookie this sets carries the
  verified address, and **that** is the account — order history, profile,
  addresses and cancellation are all scoped to it. Clerk, when configured, is
  a second door to the same place, never a requirement.
- **Scope customer data to the session email, never to a request parameter.**
  `requireAccount()` in `src/lib/account.ts` is the only acceptable source
  under `/account`, and every address query takes `customerId` in its `WHERE`
  clause even where the row id alone would be unique — ownership is a
  property of the query, not of the caller remembering to check. The order
  page is readable with the ULID alone because that is the credential in the
  emailed link; anything destructive requires the session.
- **`SESSION_SECRET` lives on `globalThis`** when unset, not in module scope.
  Next bundles each route separately, so a plain module constant is a
  different value in `/api/account/lookup` than in `/track` — a cookie signed
  by one then fails to verify in the other.
- **GST is one switch, not two.** A complete seller identity
  (`SELLER_LEGAL_NAME` + `SELLER_GSTIN` + `SELLER_STATE` + `SELLER_ADDRESS`)
  decides *both* whether tax is recorded on an order and whether the invoice
  is a tax invoice — because s.32 of the CGST Act forbids an unregistered
  person from collecting tax, so there is no state in which one is true and
  the other is not. Splitting them produced a pro-forma that read "no GST
  registration is configured" above a printed CGST/SGST breakdown. Every tax
  figure is **snapshotted onto the order at checkout**, so configuring a
  registration later never backdates an earlier invoice.
- **Tax comes out of the price, never on top,** and the tax is the remainder
  after the taxable value, never rounded independently — that is what makes
  an invoice reconcile to `total_paise` exactly. See `src/lib/gst.ts`.
- **Invoice numbers are allocated on first render, not at checkout.** A
  cancelled order would otherwise burn a number, and a gap in a GST series is
  a question you do not want to answer.
- **Consent is the load condition, not a filter.** `AnalyticsLoader` does not
  reach `import("posthog-js")` until a yes has been recorded, so before a
  decision there is no bundle, no request and no cookie — which is what
  `npm run test:consent` asserts against the served bytes. A banner sitting
  on top of a tracker that runs anyway is worse than no banner, because it
  tells the visitor something they cannot check.
- **There is no "marketing" toggle,** because there is no marketing tracking.
  A switch that controls nothing is theatre and teaches people that these
  switches are meaningless. Add the tool, add the category, bump
  `CONSENT_VERSION`, and everyone gets asked again.
- **No CSP nonce, deliberately.** A per-request nonce forces every page to be
  dynamic, and static browsing is this site's entire load story. The origin
  allowlist plus absolute `frame-ancestors`/`object-src`/`form-action` is the
  better trade here; the reasoning is written out in `next.config.ts`.
- **Erasure anonymises, it does not delete.** Orders are financial records
  with a statutory retention period, so `eraseCustomer` overwrites every
  column that could name someone and leaves the transaction. The UI says
  exactly that before you confirm — telling someone their data is gone while
  the row survives would be the actual violation.
- **Parameterised SQL only**, secrets only via env.
- **Never fabricate social proof.** There are no ratings, no review counts, and
  scarcity messaging appears only when the stock number is literally true. The
  same rule covers a GSTIN: there is no placeholder anywhere, and the one in
  `scripts/test-commerce.mjs` is a fixture that a spawned test server reads —
  it never reaches a config file or a rendered document.
