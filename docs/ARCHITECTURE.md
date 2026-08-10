# Architecture

How this application is shaped, and why. Read this before your first change.

The short version: **one Next.js application, one MySQL database, and a hard
rule that browsing never touches either the database or a third party.**
Everything below follows from that.

---

## The one-paragraph summary

There is no separate frontend and backend. Pages and API routes are the same
Node process. Product pages are prerendered at build time from MySQL and
served from static output; the database is reached only by checkout, orders,
the admin, the webhook, the scheduled jobs and `/api/health`. Every
third-party service is optional and degrades to a documented inert state, so
the site builds, runs and takes Cash on Delivery orders with **zero keys
configured**.

---

## Rendering: which pages touch what

This is the most important table in the repository. Getting a page into the
wrong row is the most expensive mistake available here.

| Route | Strategy | Touches MySQL at request time? |
|---|---|---|
| `/`, `/products`, `/blog/*`, all policy pages | Static, `revalidate = 3600` | **No** |
| `/products/[slug]` | SSG + `dynamicParams = true` | **No** for the five prebuilt slugs |
| `/search`, `/wishlist`, `/track` | Dynamic | No — search runs over the cached catalogue |
| `/cart`, `/checkout` | Static shell, client cart | No |
| `/orders/[id]`, `/account/*` | Dynamic, session-scoped | Yes |
| `/admin/*` | Dynamic, `force-dynamic` | Yes |
| `/api/*` | Route handlers | Yes, where relevant |

**Why it matters.** `apps/web/scripts/chaos.mjs` stops MySQL under live
traffic and asserts that browsing keeps serving 200s. That property is not
an optimisation, it is the reason a database outage costs you checkouts
rather than the whole shop. Adding a database read to a page in the first three
rows silently destroys it, and nothing will fail loudly — the page will
simply start returning 500s the next time MySQL hiccups.

Before adding a query to a page, ask which row it is in. If the answer is
one of the first three, the data belongs in the cached catalogue or it
belongs in a client component that fetches it after paint.

**The home page is the worked example.** Until M16 it read nothing and was
immune to a database outage for free. It now shows live prices and real
reviews, which meant two reads — and both go through `unstable_cache` with
a tag (`getCatalog`, `getRecentReviews`), so the page is still built once
and served from static output. `test:db-down` asserts `/` still returns 200
with MySQL stopped; `chaos` puts it in the traffic mix during an outage and
asserts zero browse failures.

What it did cost: `/` joined `/products` and `/sitemap.xml` in the set of
pages a **hard purge immediately before an outage** takes offline, because
`revalidateTag(tag, "max")` expires rather than marks stale. That is a
real, small, understood price for showing a price, and it is written down
in the README rather than discovered during an incident.

---

## Caching, and the trap in it

Catalogue reads go through `unstable_cache` with a tag:

```ts
export const getCatalog = unstable_cache(loadCatalog, ["catalog"], {
  tags: [PRODUCTS_TAG],
  revalidate: 3600,
});
```

Two tags exist and they are separate on purpose:

- `products` — the catalogue. Purged by `revalidateCatalog()`.
- `reviews` — published reviews. Purged by `revalidateReviews()`.

Moderating a review must not send every product page back to the database
for catalogue data that has not changed. That is the entire reason for the
second tag.

### Never `revalidatePath` a product route

Use `revalidateTag(PRODUCTS_TAG)`. A tag marks pages stale and keeps serving
the previous copy while they regenerate. A path purge deletes the entry.

While `/products/[slug]` also had `dynamicParams = false`, that deletion was
unrecoverable: with `fallback: false` there was nothing left to regenerate
from, the route answered `NoFallbackError`, and all five product pages 404'd
permanently with the database perfectly healthy. It was live. One stock edit
in `/admin` did it. `apps/web/scripts/chaos.mjs` §1b guards it.

`dynamicParams` is `true` since M14 so a product created in the admin has a
page, which as a side effect makes a path purge recoverable. **The rule
stands anyway** — the reason for preferring the tag never depended on the
bug.

### A purge marks stale; it does not rebuild

After `revalidateTag`, the next request still receives the old copy while
regeneration runs behind it. Scripts asserting on freshly published content
use the `freshPage()` helper and fetch several times. This was measured, not
guessed.

### A purge is local to one process

Next's cache lives in the process that holds it. On four replicas, an admin
edit purges one. `apps/web/src/lib/revalidate.ts` therefore announces the
purge on a Redis channel and every instance applies it by calling its own
`/api/revalidate?fanout=1` over loopback — a route handler, because
`revalidateTag` needs a request store and a pub/sub callback has none.

**This is a self-hosted mechanism, and it is off on Vercel.** Vercel's Data
Cache is shared across instances and regions, so `revalidateTag` is already
global there and the channel has nothing to fan out. Running it anyway
would be worse than pointless: Vercel freezes a function between
invocations, so the subscription is idle exactly when a message arrives and
the purge is silently lost — a mechanism that looks alive and delivers
nothing. `crossInstancePurgeNeeded` in `purge-channel.ts` gates both ends.

So what `REDIS_URL` buys depends on where you run:

| Deployment | Rate limiter | Purge channel |
|---|---|---|
| One container | in-memory is already correct | not needed — one cache |
| `--scale app=4` | **shared, and required** | **required** |
| Vercel | **shared, and required** | off — `revalidateTag` is global |

---

## Module boundaries

The repository is a pnpm + Turborepo workspace, and the application is one
package inside it:

```
apps/web/          the Next.js application (was the repo root)
apps/mobile/       the Expo app — Phase 3, does not exist yet
packages/          shared workspace packages — Phase 1, empty today
docs/  research/   repository-wide, unmoved
```

Inside `apps/web`, which is the root of every `src/…` path in this document:

```
src/
  app/            routes only — pages, layouts, route handlers, server actions
  components/     UI. Server components by default.
  db/
    migrations/   forward-only .sql, numbered
    queries/      the ONLY place SQL is written
    seed/         catalogue content for db:seed
  lib/            pure-ish logic: money, gst, coupons, search, session, redis…
  content/        editorial copy in TypeScript — blog registry, product prose, FAQ
  store/          Redux Toolkit, client cart only
```

Rules that are enforced by review:

- **SQL lives in `src/db/queries/`.** Not in a page, not in a route handler,
  not in a server action. An action calls a query function; it does not
  write a query.
- **`src/lib/*` modules that touch the server import `"server-only"`.** That
  import throws at build time if the module is ever pulled into a client
  bundle, which is how `mysql2` and your database password stay out of the
  browser.
- **`src/lib/env.ts` is the only reader of `process.env`** on the server,
  apart from scripts. Capability flags (`hasClerk`, `hasRazorpay`,
  `hasSmtp`, `hasRedis`, `hasObjectStorage`) are computed there once.
- **Client components read only `NEXT_PUBLIC_*`**, directly, so the value is
  inlined at build.

---

## Server components by default

A component is a server component unless it needs state, an effect, or a
browser API. `"use client"` is a decision with a byte cost, and the byte
budget is tight (see `docs/PERFORMANCE.md`).

When a client component needs rich content inside it, **render that content
on the server and pass it as a node**:

```tsx
// page.tsx — server
<ReorderList items={rows.map((r) => ({ id: r.id, node: <Row row={r} /> }))} />
```

The list's interactivity is client-side; the rows are not. This pattern is
used by `ReorderList`, `RecentlyViewed` and the wishlist.

---

## The graceful-degradation contract

Every integration is optional, and "optional" has a precise meaning here: a
missing key produces a **documented inert state**, never a crash and never a
lie.

| Absent | What happens |
|---|---|
| Clerk | `/admin` returns **404**, not 403 — the surface is invisible |
| Razorpay | Only Cash on Delivery is offered; the option is not shown broken |
| SMTP | Emails are composed and recorded in `email_log` as `skipped_no_smtp` |
| Seller GSTIN | Invoices print headed **pro-forma, not a tax invoice**, and no GST is collected or recorded |
| Turnstile | No widget renders; the honeypot and rate limiter still apply |
| Redis | Per-process rate buckets, local-only cache purges |
| Object storage | Admin attaches image paths; no file picker is shown |
| Sentry / PostHog | Nothing loads, nothing is sent |

The test for a new integration: **does the site still build and sell with
the key removed?** If not, it is not finished.

---

## Requests, in order

```
Browser
  → nginx (edge profile: gzip, static caching)
    → src/proxy.ts        rate limit on /api/*, Clerk on /admin only
      → Route handler / page
        → src/db/queries/*  parameterised SQL
          → MySQL
```

`src/proxy.ts` (Next 16's replacement for `middleware.ts`) is deliberately
narrow — its matcher excludes every public page, so browsing never pays for
the hop. Guest checkout never touches Clerk.

---

## Background work

Four scheduled jobs, driven by `vercel.json` on Vercel or the `cron`
container otherwise. **Run one or the other, never both**, or customers get
duplicate emails. Each is a `POST /api/jobs/<name>` authenticated with
`CRON_SECRET`. A fifth schedule ships the night's backup.

---

## Where to look when

| Question | File |
|---|---|
| How is a price calculated? | `src/lib/money.ts`, `src/lib/gst.ts` |
| How is an order created? | `src/db/queries/orders.ts` — `createOrder` |
| Why does the cart survive a reload? | `src/store/cart-slice.ts` + the localStorage listener |
| How does someone see their order with no account? | `src/lib/session.ts`, `/track` |
| What does the admin gate on? | `src/lib/auth.ts` |
| Why is this page slow / heavy? | `docs/PERFORMANCE.md`, then `pnpm --filter web run audit` |

---

## Related

`docs/DATABASE.md` · `docs/DESIGN-SYSTEM.md` · `docs/PERFORMANCE.md` ·
`docs/SECURITY.md` · `docs/CONTRIBUTING.md` · `docs/docker.md` ·
`docs/deploy.md`
