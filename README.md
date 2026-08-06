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
| `npm run docker:staging` | The same stack as a staging environment, on its own ports and volumes |
| `npm run docker:logs` / `docker:down` / `docker:reset` | Tail, stop, wipe |
| `npm run backup` | Dump, verify, upload to object storage, prune. `-- --upload-only` ships what the container already wrote |
| `npm run uptime -- https://your-site` | Poll `/api/health`, alert on the transition, recover quietly |
| `npm run db:up` / `db:down` | Start/stop the MySQL container |
| `npm run db:migrate` / `db:seed` | Schema and catalogue content |
| `npm run db:reset-stock` | Restore stock after load testing (dev only) |
| `npm run cron` | Run the three scheduled jobs locally |

### Tests

All of these run against a live server and a live database, so start one first
(`npm run standalone:start`, or `npm run dev`).

`test:admin` is the exception and needs only the database. The admin is
Clerk-gated and Clerk is not configured in development, so there is no HTTP
surface to drive; it imports the real query modules instead, through the
`@/` resolve hook in `scripts/alias-loader.mjs`. That means it exercises the
SQL the application runs rather than SQL written inside the test, which is
the difference between a green tick and evidence.

| Command | Covers |
|---|---|
| `npm run test:checkout` | Idempotency, atomic stock, oversell, webhook signature, rate limiting |
| `npm run test:account` | Order lookup, enumeration resistance, session scoping, cancellation, the account area |
| `npm run test:commerce` | GST arithmetic and the split, invoice numbering, returns windows, re-order, prefill |
| `npm run test:consent` | Security headers, that nothing tracks before consent, the grievance notice, the honeypot |
| `npm run test:discovery` | Search ranking and synonyms, filters, PIN code estimates, wishlist scoping, back-in-stock |
| `npm run test:promotions` | Coupon arithmetic, caps under concurrency, GST on a discounted line, verified-buyer reviews, newsletter double opt-in, share cards |
| `npm run test:admin` | CSV escaping and formula injection, presigned uploads, product CRUD and what it refuses, report arithmetic, return transitions, the audit log |
| `npm run test:offline` | The service worker's exclusion list, manifest installability, the CSP directives a PWA needs, and the shared rate limiter |
| `npm run test:db-down` | Browsing with MySQL stopped (stop it first) |
| `npm run test:jobs` | Cron authorisation, stale-order cancel, reminder dedupe |
| `npm run validate:schema` | Titles, descriptions, canonicals, JSON-LD, internal links |
| `npm run audit` | Lighthouse gates: SEO 100, Perf ≥90, A11y ≥95, BP ≥95, JS per page (190 KB; 200 on the product page) |
| `npm run loadtest` | k6 browse + checkout load, verified against the database |
| `npm run chaos` | Kills MySQL under live traffic and checks what survives |

`npm run audit` and `npm run loadtest` need Chrome and
[k6](https://k6.io) respectively.

**Run `test:db-down` from a warm cache**, which means browsing the site once
before stopping MySQL — and not straight after `chaos` or `test:admin`. Both
of those end by purging the catalogue tag, and `revalidateTag(tag, "max")`
expires an entry rather than marking it stale. An expired static page with
no database to regenerate from has nothing to serve, so `/products` and
`/sitemap.xml` answer 500 instead of the cached copy. That is the honest
cost of a hard purge and worth knowing before an outage: **do not force a
revalidation and then take the database down.** Product pages are unaffected
— they are prerendered and keep a copy either way, which is what `chaos`
section 1b asserts.

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
- **Never call `revalidatePath` on `/products/[slug]`.** Use
  `revalidateTag(PRODUCTS_TAG)`. The tag marks pages stale and serves the
  previous copy while they regenerate, which is what you want; a path purge
  discards the entry outright. When the route also had `dynamicParams =
  false` this was catastrophic rather than merely wrong — with no fallback
  there was nothing left to regenerate from and all five pages 404'd
  permanently until a rebuild, with the database perfectly healthy. M14 set
  `dynamicParams = true`, so the failure is no longer permanent, but the
  rule is unchanged and the reason for it never depended on the bug.
  Documented at the call site in `src/lib/revalidate.ts` and guarded by
  `npm run chaos`.
- **A product page must work without editorial copy.**
  `src/content/products.ts` holds hand-written copy for the five launch
  products and is the better source when it exists. A product created in the
  admin has no entry there and cannot get one without a deploy, so
  `fallbackContent()` derives a real page from what the database knows.
  Everything in it is a fact already stored — **except the FAQ, which stays
  empty**. A generated Q&A would be published as FAQPage structured data,
  which is a spam-policy violation and a claim about customers that is not
  true.
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
- **Search does not touch the database, and there is no FULLTEXT index.**
  Matching runs in memory over the same hourly-cached catalogue every
  browsing page reads, so a search costs no query and still works while
  MySQL is down. The reason is not performance: a FULLTEXT index cannot
  match "haldi" to turmeric, "mirchi" to chilli or "fox nut" to makhana,
  and that synonym table in `src/lib/search.ts` *is* the feature. Revisit at
  a few thousand products.
- **Rank on exact hits, count prefix hits separately.** Pack labels
  tokenise to `["100", "g"]`, so every product owned a one-character token
  and `"guntur".startsWith("g")` matched the entire catalogue. Both sides of
  a prefix comparison now have a minimum length, and a prefix hit adds to
  the score without counting as a match — otherwise two weak hits outrank
  one exact hit on the product's own name.
- **`/products` filters on the client, on purpose.** Reading `searchParams`
  in the server component would opt the page into dynamic rendering, and
  static browsing is the entire load story. The cards are rendered on the
  server and handed to `CatalogGrid` as nodes, so the card never becomes a
  client component; only the *choosing* is client-side, behind a Suspense
  boundary whose fallback is the full unfiltered shelf.
- **One delivery table, two readers.** `src/lib/serviceability.ts` holds the
  transit bands, and `/shipping-policy` renders from it rather than
  restating them. A checker quoting "3–5 days" beside a policy saying "4 to
  7" turns the policy into a lie nobody notices until a customer quotes it
  back. Where a PIN prefix covers both plains and hills, the slower band
  wins — an estimate that runs long is a pleasant surprise.
- **`next/dynamic` only saves bytes when the component does not render.**
  It earns its place on the back-in-stock form, which is markup for a state
  that is usually false. Tried on the PIN code checker, which is on every
  product page, it made the page 2 KB *heavier*: the chunk is fetched
  anyway and the split adds its own wrapper.
- **The wishlist merges on arrival and replaces thereafter.** Both the
  browser's list and the server's are real, so opening `/wishlist` unions
  them; removals made while on that page replace, or a union would put back
  what was just taken out. A session whose customer row is gone answers
  `401`, exactly as a guest does — it used to answer `200 {slugs: []}`, and
  the page read that as a completed merge and wiped the local list.
- **A discount changes the tax, so it is applied before the tax is worked
  out.** Prices are GST-inclusive and s.15(3)(a) of the CGST Act excludes a
  discount given at the time of supply and recorded on the invoice from the
  transaction value — so each line's tax comes out of `line_total -
  discount`, and each line's share of the discount is stored in
  `order_items.discount_paise`. Taxing the undiscounted line would
  over-declare output tax on every order that used a voucher while the
  total the customer paid still looked right, which is why
  `test:promotions` reconciles **line rows** rather than the order total.
  The split is largest-remainder (`allocateDiscount`), so the shares sum to
  the order discount to the paise.
- **Free shipping is waived, not discounted,** and the threshold is judged
  on the pre-coupon subtotal. Waiving leaves the taxable value alone;
  discounting the goods would move it. Judging the threshold after the
  discount would take away delivery someone had already earned by what they
  put in the basket, which reads as a penalty for using the code.
- **The cart's coupon panel is a quote, and nothing more.** The only
  authority is `claimCouponTx`, inside the checkout transaction, under
  `SELECT ... FOR UPDATE` on the coupon row — that row lock is what makes
  "first 100 orders" true rather than approximately true. Reserving a use
  while somebody browses would let a handful of abandoned carts exhaust a
  promotion. The coupon lock is taken **after** the variant locks and
  before the customer upsert, so every checkout takes the same locks in the
  same order and two cannot deadlock.
- **A review needs a delivered order, enforced in SQL.** Every write path
  goes through `findReviewableOrder`, which only returns an order that is
  `delivered`, belongs to the session email, and contained that product;
  there is no function that can insert a review without one. The byline is
  derived from the order name ("Bibhash S."), never typed, or one customer
  could sign as another. `AggregateRating` is emitted only when published
  reviews exist, and `validate:schema` checks it against the page — the
  count must match and each review must actually be printed in the HTML.
- **Reviews have their own cache tag.** Publishing one calls
  `revalidateReviews()` alone, so it does not send every product page back
  to the database for catalogue data that has not changed. `/api/revalidate`
  purges both, because a manual escape hatch that leaves half the cache in
  place is worse than none.
- **A tag purge does not rebuild — it marks stale.** After
  `revalidateTag`, the next request serves the old copy and triggers a
  regeneration behind it, so it takes repeated requests before a page is
  fresh. Scripts that assert on freshly published content use the
  `freshPage()` helper rather than assuming one fetch is enough; this was
  measured, not guessed.
- **The catalogue archives; it does not delete.** `order_items.variant_id`
  is `ON DELETE SET NULL`, so removing a variant would not fail — it would
  quietly detach the line from every order that contained it. Archiving
  (`is_active = 0`) takes it off the catalogue, out of search and out of
  checkout, which already requires `v.is_active = 1 AND p.is_active = 1`.
  Photographs are the one exception and really are deleted: no order line
  references an image id.
- **A slug is not just a URL.** It is snapshotted onto every order line,
  keyed on by reviews and wishlists, and indexed by Google. `updateProduct`
  throws `SlugLockedError` if any of those point at it, and the admin names
  which one rather than refusing without a reason.
- **Stock has exactly one write path.** `setVariantStock` in
  `src/db/queries/admin.ts`, because a restock from zero has to wake the
  back-in-stock queue and that decision needs the previous value read under
  the lock that writes the new one. `updateVariant` deliberately has no
  `stock_qty` in its `UPDATE` — an innocuous-looking field on the product
  form would bypass it and silently strand everyone waiting.
- **Ordered is not collected.** In a cash-on-delivery market these are
  different numbers and `getSalesSummary` reports both: `gross` is what
  customers ordered, `realised` is prepaid-and-paid plus COD-and-delivered.
  Conflating them is how a shop believes it has money it has not been
  handed.
- **Reports group on Indian days.** `created_at` is a TIMESTAMP handed back
  in the session time zone — UTC in the Docker image — so a naive
  `DATE(created_at)` puts everything ordered before 05:30 IST on the
  previous day. The `IST()` helper in `src/db/queries/reports.ts` shifts by
  the measured session offset rather than assuming UTC, and does the
  arithmetic itself because `CONVERT_TZ` returns NULL when the named
  time-zone tables are not loaded, which the official MySQL image does not
  ship.
- **Every CSV cell is guarded against formula injection.** A value starting
  `=`, `+`, `-`, `@`, tab or CR is executed by Excel, LibreOffice and Google
  Sheets on open, and an export is exactly the path that carries customer
  names, addresses and free text out of the site and into a spreadsheet.
  `src/lib/csv.ts` prefixes such a cell with an apostrophe — after checking
  it is not simply a negative number, which would otherwise break every sum
  in the sheet.
- **Uploads are presigned; the server never holds the bytes.** Hand-rolled
  SigV4 in `src/lib/storage.ts`, no SDK. The object key is generated from
  twelve random bytes so nothing the client sends can steer the path or
  overwrite an existing photograph, `content-type` is signed so a URL issued
  for a JPEG cannot accept an HTML document, and SVG is refused outright
  because it is an XML document that can carry `<script>`.
- **The audit log has a writer and two readers, and no third function.**
  `recordAdminAction` never throws: the log records work that is already
  committed, so a logging failure must not turn a saved edit into an error
  the owner sees and retries. There is deliberately no update and no delete
  — a log the application can rewrite is not evidence of anything.
- **The rate limiter is shared only when Redis is.** In-memory buckets are
  per-process, so `--scale app=4` turns a 10/min checkout limit into forty
  a minute and the 5/min on order lookup into twenty. Set `REDIS_URL` for
  anything running more than one replica; `/api/health` reports which store
  is behind it. The Lua script applies the whole bucket atomically and uses
  **Redis's clock**, not the caller's — four containers disagreeing about
  the time would refill at different rates and the fast one would hand out
  free tokens.
- **`enableOfflineQueue: false` on the command connection, `true` on the
  subscriber.** The default buffers commands while Redis is unreachable and
  resolves them on reconnect, which would hang a checkout rather than
  erroring it — so the request path fails fast and falls back to the
  in-memory bucket. The subscriber wants the opposite: its one SUBSCRIBE
  lands before the socket is up and would be rejected outright. Both were
  measured, not reasoned about.
- **A cache purge is announced, not just applied.** Next's cache lives in
  the process that holds it, so on four containers an admin publishing a
  product purges one and the other three serve the old catalogue for an
  hour. `revalidate.ts` publishes on a Redis channel and each instance
  applies it by calling its own `/api/revalidate?fanout=1` over loopback —
  a route handler, because `revalidateTag` needs a request store and a
  pub/sub callback has none. The `fanout` flag is what stops two
  containers forwarding the same purge to each other forever.
- **`instrumentation.ts` does not run in the standalone bundle.** Next's
  tracer leaves `instrumentation.js` out of `.next/standalone`, which is
  what the Dockerfile serves — so `register()` never fired in production,
  and **Sentry's server-side init never ran there either**. Found by
  accident in M15 when the purge subscriber silently did not start.
  `bootOnce()` in `src/lib/boot.ts` is called from both places; `/api/health`
  is the one route every deployment shape hits within seconds of boot.
- **The service worker never touches anything private.** `/api`, `/admin`,
  `/checkout`, `/orders`, `/account`, `/track` are excluded by prefix, and
  only GET is intercepted. The Cache API is origin-scoped storage that
  outlives the tab, so a cached order page is a privacy leak on a shared
  phone. Navigations are network-first with a 3.5s timeout — a cached price
  is worse than a wait, and this is a shop.
- **Only Cash on Delivery is ever queued offline,** and only because every
  order carries an Idempotency-Key with a unique index behind it, so a
  replay that races the page's own retry makes one order rather than two. A
  prepaid order needs the Razorpay window and cannot be held; queueing one
  would mean placing an unpaid order and hoping. The wording never says
  "placed" — it says "waiting to be sent", because that is what it is.
- **The script budget must measure a first visit.** A response served by
  the service worker has a `transferSize` of zero, so a warm cache would
  make the budget pass while a real regression sailed through. `audit.mjs`
  fails if any counted script came from the worker. Measured: Lighthouse
  registers it on `load`, after the trace window, so none do.
- **A backup is not a file.** `docker/backup.sh` checks for mysqldump's
  "Dump completed on" marker and for a table it knows exists, and deletes
  the archive if either is missing — a truncated dump has the right name, a
  plausible size and a gzip that opens, and restores as a partial database.
  Remote retention is an object-lifecycle rule on the bucket, not a delete
  in this script: a script that deletes backups is a script that can delete
  backups.
- **The dump runs on the mysql:8.4 image, not the app image.** MySQL 8.4
  authenticates with caching_sha2_password and Alpine's mariadb-client does
  not ship that plugin — `apk add mysql-client` installs the same package
  under another name, and Debian's `default-mysql-client` is also MariaDB.
  Measured, not assumed. The alternative was weakening the database user's
  auth plugin.
- **Parameterised SQL only**, secrets only via env.
- **Never fabricate social proof.** Nothing in `reviews` is seeded, and a
  product nobody has reviewed shows no rating, no average and no count —
  not a zero, not a placeholder. `getProductReviews` returns `rating: null`
  rather than a zeroed object precisely so a caller cannot print "0.0 out
  of 5" for a product with no reviews. Scarcity messaging appears only when
  the stock number is literally true. The same rule covers a GSTIN: there
  is no placeholder anywhere, and the ones in `scripts/test-commerce.mjs`
  and `scripts/test-promotions.mjs` are fixtures a spawned test server
  reads — they never reach a config file or a rendered document.
