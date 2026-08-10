<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ekmool — project rules

A D2C storefront for five GI-tagged single-origin Indian foods. Next.js 16 ·
React 19 · Tailwind v4 · MySQL 8 · TypeScript strict.

**Full documentation is in [`docs/`](docs/README.md). This file is the
summary to hold in context; each rule links to the document explaining it.**

---

## Read before writing code

| First | Then, for what you are touching |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | [`DATABASE`](docs/DATABASE.md) · [`DESIGN-SYSTEM`](docs/DESIGN-SYSTEM.md) · [`PERFORMANCE`](docs/PERFORMANCE.md) · [`SECURITY`](docs/SECURITY.md) · [`CONTRIBUTING`](docs/CONTRIBUTING.md) |

---

## The twelve rules

A reviewer sends a change back for any of these without discussion.

1. **TypeScript strict. No `any` on an exported surface.**
2. **Parameterised SQL only.** One documented `LIMIT` exception, clamped to
   an integer first, with the reason at the call site.
3. **Secrets only from the environment.** No placeholder credentials
   anywhere — a placeholder GSTIN is one bad merge from a fabricated tax
   document.
4. **Money is integer paise.** Rupees appear only in admin forms and CSV
   exports, converted in exactly one place, with `Math.round(rupees * 100)`.
5. **Never fabricate social proof.** No seeded reviews, no invented
   ratings, no "3 left!" unless stock is literally 3. A product nobody has
   reviewed shows no rating at all — not a zero.
6. **Design tokens only.** A hardcoded hex in a component is a review
   failure. `gold-800` is the only gold that passes contrast as ink.
7. **Guest checkout never requires login.** There is no registration and
   there must never be one.
8. **Browsing never touches the database.** `/`, `/products`,
   `/products/[slug]`, `/blog/*` and the policy pages are static and must
   stay that way — `pnpm --filter web chaos` asserts they serve 200s with
   MySQL stopped.
9. **Never `revalidatePath` a product route.** Use
   `revalidateTag(PRODUCTS_TAG)`. A path purge 404'd all five product pages
   permanently in production once, with the database perfectly healthy.
10. **Nothing that has been sold is deleted.** Archive it —
    `order_items.variant_id` is `ON DELETE SET NULL`, so a delete does not
    fail, it silently detaches the line from every order that contained it.
11. **Accessibility stays at 100.** Focus rings, 44px touch targets,
    visible labels, 4.5:1 contrast, a keyboard path for everything.
12. **Ask before adding a dependency.** Exactly one has been added since
    v1.0.0, and it was approved first.

---

## Shape

A pnpm + Turborepo workspace. The application lives in `apps/web/`; every
`src/…` path below is relative to it.

```
apps/web/          the Next.js application (was the repo root)
  src/app/         routes only — pages, layouts, route handlers, server actions
  src/components/  UI, server components by default
  src/db/queries/  the ONLY place SQL is written
  src/db/migrations/ forward-only, numbered .sql
  src/lib/         money, gst, coupons, search, session, redis, storage, csv
  src/content/     editorial copy in TypeScript
  src/store/       Redux Toolkit — the client cart, nothing else
packages/          shared workspace packages — empty until Phase 1
docs/ research/    repository-wide, at the root
```

- Server modules import `"server-only"`. Client components read only
  `NEXT_PUBLIC_*`.
- `apps/web/src/lib/env.ts` is the only server-side reader of `process.env`;
  capability flags are computed there once.
- Server actions and route handlers validate with Zod, then call a query
  function. They do not write SQL.
- Need rich content inside a client component? Render it on the server and
  pass it as a `node` prop.

---

## Graceful degradation is a contract

The site must build, run and take Cash on Delivery orders with **zero
third-party keys**. A missing key produces a documented inert state, never
a crash and never a lie: no Clerk → `/admin` returns 404, not 403; no
Razorpay → COD only; no SMTP → mail composed and logged as
`skipped_no_smtp`; no GSTIN → invoices print pro-forma and no GST is
collected; no Redis → per-process rate buckets and local-only cache purges;
no object storage → image paths instead of uploads.

**The test for a new integration: does everything still work with the key
removed?**

---

## Before saying a change is done

```bash
pnpm turbo typecheck && pnpm turbo lint
pnpm --filter web test:<area>   # the suite covering what you touched
pnpm --filter web audit         # SEO 100, a11y 100, script budget
```

Budget: 190 KB of script per page, 200 KB on the product page. Currently
178 / 181 / 184 / 176 — the headroom is thin on purpose.

Suites are **not parallel-safe** (they share a rate limiter). Run
`test:db-down` from a warm cache, and not straight after `chaos` or
`test:admin`.

---

## Habits that matter here

- **Comments explain why.** When you make a non-obvious choice, write down
  the alternative you rejected and why. When something was measured, say so
  and give the number.
- **Measure before claiming.** `next/dynamic` made one component lighter
  and another heavier; both contradicted the obvious expectation.
- **Write the assertion so it would fail.** A test that passes against
  broken code buys confidence that is not there.
- **Delete a comment in the same commit that makes it false.**
- **Copy is plain and specific.** A refusal names the rule — "That code
  needs a basket of at least ₹500", not "Invalid code". No exclamation
  marks. No disease, cure or treatment claims, ever (FSSAI).
