# Performance

The target user is on a mid-range Android phone on a 4G connection in an
Indian city, and sometimes on 3G on a train. Every rule here follows from
that and from one measurement: **JavaScript is the expensive thing**, not
images and not the server.

---

## The budget

`npm run audit` runs Lighthouse against four pages and **fails the build**
on any of them.

| Page | Script transfer | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|---|
| `/` | ≤ 190 KB | ≥ 90 | **100** | **100** | **100** |
| `/products` | ≤ 190 KB | ≥ 90 | **100** | **100** | **100** |
| `/products/[slug]` | ≤ 200 KB | ≥ 90 | **100** | **100** | **100** |
| `/blog/[slug]` | ≤ 190 KB | ≥ 90 | **100** | **100** | **100** |

Current: **178 / 181 / 184 / 176 KB.** Headroom is thin on purpose. A
generous budget catches nothing, which is the only thing a budget is for.

The product page gets 200 KB because it carries the purchase widget, the PIN
serviceability check and the review section. That is a stated exception, not
a licence to drift.

### The budget must measure a first visit

A response served by the service worker has a `transferSize` of zero. If one
were counted, the budget would quietly start measuring a warm cache and
would absorb a real regression without complaining. `scripts/audit.mjs`
fails if any counted script came from the worker. Lighthouse registers it on
`load`, after the trace window, so none do — but that is asserted, not
assumed.

### The total is noisy by about 9 KB. The chunk list is not.

Next prefetches the routes it finds links to — the header's cart link,
mainly — at Low priority. Chrome reports those responses with a
`transferSize` of 0 on some runs and their real bytes on others, on the
same build. Three consecutive runs of an unchanged home page in M16 gave
**189, 188 and 178 KB**.

So a total that jumps ~9 KB is not evidence of anything. Before believing a
regression, compare the *list* of chunks the page pulls:

```bash
node -e "const r=require('./research/audits/lh-home.json'); console.log(r.audits['network-requests'].details.items.filter(i=>i.resourceType==='Script').map(i=>[i.url.split('/').pop(), i.transferSize]))"
```

A real regression adds a **filename**. That is how the wishlist chunk was
caught arriving on the home page in M16: the total looked plausible, and
the list had one entry too many.

### A client component costs its route even if it never renders

`ProductCard` used to import `WishlistButton` and hide it behind a
`showWishlist` prop. The home page passed `false`, rendered no save
control — and still shipped the 2.9 KB wishlist store, because a client
component referenced anywhere in a route's server tree is bundled for that
route whether it renders or not.

A boolean cannot fix that. The component has to be *passed in*, so the
import lives at the call site:

```tsx
<ProductCard product={product} action={<WishlistButton … />} />   // /products
<ProductCard product={product} />                                  // home
```

---

## Where the bytes go, and how to not spend them

### 1. Server components by default

`"use client"` pulls the component, its imports, and their imports into the
bundle. Before adding it, ask whether the interactivity can live in a
smaller leaf.

`ProductPurchase` is a client component because it manages a variant
selection. The product *description* around it is not.

### 2. Render content on the server, pass it as a node

```tsx
// server
<ReorderList items={rows.map((r) => ({ id: r.id, node: <Row row={r} /> }))} />
```

The wrapper is interactive; the rows are HTML. Used by `ReorderList`,
`RecentlyViewed` and the wishlist.

### 3. `next/dynamic` only saves bytes when the component does not render

This was measured, twice, with opposite results.

- **`ReviewComposer`** sits behind a "Write a review" button. Almost nobody
  clicks it. `next/dynamic` keeps it out of the initial bundle entirely —
  a real saving.
- **The PIN serviceability checker** renders on every product page view.
  Wrapping it in `next/dynamic` made the page *heavier*: the component still
  loads, and now the loader machinery loads with it.

The rule: dynamic import is for what usually **does not render**. For
anything that always renders it is a net loss. Measure before and after with
`npm run audit`; do not reason about it.

### 4. The cart is localStorage, not IndexedDB

A handful of line items through the existing Redux listener. IndexedDB earns
its place in the service-worker layer — offline browsing and the order
outbox — and nowhere else here. Reaching for a heavier store because it
sounds more capable is how a cart becomes 15 KB of adapter.

### 5. Third-party scripts

Razorpay's `checkout.js` loads on `/checkout` only, and only when a key
exists. PostHog and Sentry are proxied through this origin (`/ingest`,
`/monitoring`) so they survive ad-blockers, and neither loads without
consent. Nothing else is allowed to load from another origin — the audit
fails on any off-origin request.

---

## Server-side

### Browsing never touches MySQL

This is a performance property before it is a resilience one. A static
response is served from disk with no connection, no query and no pool
contention, which is why the load test sustains ~450 rps on one core before
the Node process saturates.

See `docs/ARCHITECTURE.md` for which routes are in which row. Adding a query
to a static page removes it from this paragraph.

### gzip belongs at the edge

Load testing showed compression in the Node process is the single largest
CPU cost under traffic. The `edge` profile moves it to nginx:

```bash
docker compose --profile edge up -d
```

Worth turning on for anything public-facing. `docs/loadtest.md` has the
numbers.

### Scaling out

`docker compose --profile edge up -d --scale app=4`, with the app's `ports`
block commented out so nginx is the only thing published. **Set `REDIS_URL`
first** — without it each replica keeps its own rate-limit buckets and its
own cache, so limits are four times looser than they read and an admin edit
reaches one container. `/api/health` reports `rateLimiter` and `instance`.

### Queries

- One round trip where one will do. `loadCatalog` is three queries for the
  whole catalogue, joined in JavaScript, not N+1 per product.
- Index what you filter and sort on; say which query needs it in the
  migration comment.
- `LIMIT` everything that could grow. Every list query here caps.
- Never `SELECT *` in application code — name the columns, so a new column
  does not silently widen every row you fetch.

---

## Images

- `next/image` on the storefront, with width and height so nothing shifts.
  CLS is **0** on all four audited pages and must stay there.
- WebP or AVIF. The upload path accepts JPEG, PNG, WebP and AVIF and refuses
  SVG.
- 6 MB upload ceiling; a product photograph has no business being larger.
- The admin's 88px thumbnails use a plain `<img>` deliberately —
  `next/image` would need the bucket hostname in `remotePatterns` before the
  owner could see what they just uploaded.

---

## Caching layers, in order

1. **Browser** — hashed `/_next/static/*` immutable for a year.
2. **Service worker** — static cache-first, images stale-while-revalidate,
   navigations network-first with a 3.5s timeout. Never `/api`, `/checkout`,
   `/orders`, `/account`, `/admin`, `/track`.
3. **nginx** (edge profile) — static assets and gzip.
4. **Next ISR** — `revalidate = 3600`, purged by tag.
5. **`unstable_cache`** — the catalogue and reviews, same tags.

A tag purge marks stale and serves the old copy while regenerating. It does
not rebuild. Repeated requests are needed before a page is fresh — measured,
and why `freshPage()` exists in the test scripts.

---

## Measuring

```bash
npm run build && npm run standalone
npm run standalone:start          # or docker compose up -d
npm run audit                     # the gate
npm run loadtest                  # k6: browse + checkout
npm run chaos                     # kill MySQL under traffic
```

Reports land in `research/audits/`. When the budget fails, read the
network-requests audit in the JSON — it names the chunk that grew.

### Before claiming something is faster

Measure it. Both `next/dynamic` findings above contradicted the obvious
expectation, and one of them made a page heavier. A number in the PR
description beats an adjective.

---

## Related

`docs/ARCHITECTURE.md` · `docs/DESIGN-SYSTEM.md` · `docs/audit.md` (results
and the defects the gates caught) · `docs/loadtest.md`
