# Pending work

What is not finished, why it matters, and what "done" looks like. Ordered
by consequence within each section, not by effort.

Last verified against the tree at commit `bbb810d`, 10 August 2026. When you
close an item, delete it from this file in the same commit that closes it —
a stale checklist is worse than none, because it gets trusted.

One item here is kept *after* being closed (the script budget) because the
wrong diagnosis was written down twice before the right one, and the two
wrong ones both read convincingly. That is the exception, not the habit.

**Legend**

| Mark | Meaning |
|---|---|
| 🔴 | Blocks trading, or loses money/data if left |
| 🟠 | Works, but degraded or unverified |
| 🟡 | Optional; nothing breaks without it |

---

## 1. Legal and compliance

### 🔴 Grievance officer contact is unset

`GRIEVANCE_OFFICER_NAME` is set. `GRIEVANCE_OFFICER_EMAIL` is blank, and
`getGrievanceOfficer()` returns `null` unless **both** are present — so the
officer block does not render at all. `/contact` currently states that no
officer has been appointed.

That is honest, and deliberately better than inventing a name on a
statutory notice. It is still a gap: Rule 4(5) of the Consumer Protection
(E-Commerce) Rules 2020 requires a **named** officer with contact details
displayed, acknowledgement within 48 hours, and redressal within a month.
The DPDP Act 2023 wants a contact point for data grievances, which for a
shop this size is the same person.

**Done when:** `GRIEVANCE_OFFICER_EMAIL` is a mailbox someone actually
reads, set in both `.env.local` and the host. Phone is optional and shown
when present.

### 🔴 GST rates and HSN codes are unconfirmed

Migration `003_gst_invoicing.sql` seeds 5% and the HSN codes **as a
starting point, not settled fact** — the project's own documentation says
so. Seller identity is now live, so GST is being recorded on new orders
and invoices print as tax invoices.

Two things make this urgent rather than tidy-up. The rate is **snapshotted
onto each order at checkout**, so a wrong rate is a correction exercise
across every affected order, not an env edit. And invoice numbers in the
`EK/<FY>/<six digits>` series are allocated permanently on first render —
a gap in a GST series is a question you do not want to answer.

**Done when:** your CA has confirmed the rate and HSN code for all five
products, and migration 003's values match.

---

## 2. Payments

### 🔴 Razorpay is in test mode

`NEXT_PUBLIC_RAZORPAY_KEY_ID` is `rzp_test_…`. A customer can complete a
payment, receive a confirmation email, and **no money moves**. Nothing in
the UI warns about this.

**Done when:** KYC is approved, keys are `rzp_live_…`, and a **new
webhook** points at the production domain — the current one targets a
`trycloudflare.com` tunnel that dies with your laptop. Events:
`payment.captured`, `payment.failed`, `order.paid`.

Verify with a real ₹1 payment, then confirm the order flips to paid.

### 🟠 Webhook replay-idempotency is untested

The signature path is verified — a correctly-signed payload returns 200, a
tampered one 400, measured against the live endpoint. What is **not**
verified is that a redelivered webhook is a no-op. The mechanism exists
(`orders.razorpay_payment_id` is `UNIQUE`, so a replay updates zero rows),
but the assertion covering it lives in `npm run test:checkout`, which
currently fails for an unrelated reason — see section 4.

---

## 3. Server and deployment

### 🔴 Nothing is deployed yet

Vercel is the chosen target. `vercel.json` is committed and correct; the
Aiven database is migrated and seeded and holds the full schema.

Checklist for the first deploy:

- All 26 env vars set, from `.env.local.aiven`
- `REDIS_URL` **unset** — Vercel has no Redis, and `127.0.0.1` would fail
  every request. `redis: off` in `/api/health` is the correct result
- `NEXT_PUBLIC_APP_URL` set to the assigned URL **and then redeployed** —
  it is inlined into the client bundle at build time, so a restart does
  not pick it up
- `MAIL_FROM` without the surrounding quotes it carries in `.env.local`
- `CRON_SECRET`, `REVALIDATE_SECRET`, `SESSION_SECRET` regenerated, not
  copied from development
- `DATABASE_SSL_CA` pasted as **one line** with literal `\n` — if it
  wraps, the handshake fails with `HANDSHAKE_SSL_ERROR`

**Done when:** `/api/health` returns `{"ok":true,"db":"up"}` on the
production URL.

### 🔴 Four credentials from the setup session need rotating

These were pasted into a chat transcript and should be treated as exposed:

| Credential | Where | Note |
|---|---|---|
| Aiven `avnadmin` password | Aiven → Users | Guards real orders and customer addresses |
| Sentry `sntryu_` token | Sentry → Auth Tokens | Personal token: full account access. Replace with an **org** `sntrys_` token scoped to `project:releases` |
| PostHog `phx_` key | PostHog → Personal API Keys | Full account access. Revoke; this app never needs one |
| First Aiven password | — | Belonged to the Kafka service created by mistake; delete that service |

### 🟠 Redis is absent in production

Vercel has no Redis, so rate-limit buckets are per-process and cache
purges are local to one instance. This is a documented inert state, not a
fault — but with more than one instance a 10/min checkout limit becomes
N×10/min.

**Done when:** an external Redis (Upstash has a free tier) is configured,
or the shop stays on a single instance deliberately.

### 🟡 The stale `ekmool-db` Aiven service

Created as **Apache Kafka** by mistake while setting up MySQL. It consumes
free-tier capacity and does nothing. Delete it.

### 🟡 Object storage is unconfigured

No `S3_*`, so the admin manages photographs by path under
`public/images/products/` — which is how all five launch products work.
The file picker simply does not appear. Cloudflare R2 is the
recommendation: 10 GB free and no egress charge. All five variables or
none; a partial set counts as unconfigured.

Backups also reuse these to go off-site. Without them the nightly dump
still runs and is still verified — it just stays on disk.

### 🟡 Sentry source maps

`SENTRY_AUTH_TOKEN` is blank, so production stack traces are minified.
Errors are still captured. Needs an **org** token scoped to
`project:releases` — see the rotation table above.

---

## 4. Tests and CI

### 🔴 `npm run test:checkout` fails

Every assertion in section 1 of the suite fails: checkout returns **400**,
so no order is created and stock never moves.

**This is a harness gap, not a product bug.** Turnstile is now configured,
so `/api/checkout` requires a token; the suite predates that and sends
none, so `verifyChallenge` returns `missing_token`. Real checkout is
unaffected — a browser supplies the token.

The consequence is that there is currently **no automated coverage of
checkout at all**, including the webhook replay-idempotency in section 2.

Two ways to fix, in preference order:

1. Wire Cloudflare's official test keys into the test env
   (`1x0000000000000000000000000000000AA` always passes). Keeps coverage
   with Turnstile enabled, which is what production looks like.
2. Run the suite against an env with the Turnstile variables unset — no
   code change, but it stops testing the configuration you actually ship.

There is also a smaller robustness bug: the suite passes `undefined` into
a SQL bind at `scripts/test-checkout.mjs:105` when checkout fails, so it
dies with a `mysql2` `TypeError` instead of reporting a clean failure.
Guarding that bind would turn a stack trace into "checkout returned 400".

### 🟠 Suites other than checkout are unverified since Turnstile

`test:account`, `test:commerce`, `test:promotions` and the rest have not
been run since Turnstile and the seller identity were switched on. Any
suite that posts to a challenge-protected form has the same blind spot.

Run them one at a time: they share a rate limiter and are **not
parallel-safe**.

---

## 5. Cron jobs

### 🟠 All three run daily, not on their intended schedule

A Vercel **Hobby** account rejects any cron more frequent than once a day.
The abandoned-payment reminder wants to be hourly and is hourly under
docker-compose; on Vercel it is `0 2 * * *`.

Nothing is missed: `findAbandonedOrderIds` selects orders **1 to 48 hours
old** that have never been chased, so a daily pass still catches every one
inside that window. A customer who abandons at 08:00 is emailed the next
morning rather than an hour later — a worse reminder, not a lost one.

**Done when:** on a Pro plan, restore `0 * * * *` in `vercel.json`. The
route comment in `abandoned-payment-reminder/route.ts` says the same.

### 🟠 No cron has ever run successfully

The three jobs have never executed in a deployed environment, because
nothing is deployed. `authorizeJob` was fixed to accept Vercel's
`Authorization: Bearer` shape — verified locally against the dev server —
but that is not the same as watching a real invocation succeed.

Worth knowing about the failure mode that fix addressed: Vercel reports an
invocation as **successful** even when the route returns 401. A
misconfigured `CRON_SECRET` therefore looks healthy in the dashboard while
no work happens. Check the response body, not the invocation status.

**Done when:** all three appear under Vercel → Settings → Cron Jobs and
one manual trigger of each returns 200.

### 🔴 Never run two schedulers at once

`vercel.json` and `scripts/cron-runner.mts` drive the same three jobs. If
both run, customers get **duplicate reminder emails**. Pick one platform.

---

## 6. Admin-editable content (CMS)

The plan and its reasoning are in [`PLAN-cms.md`](PLAN-cms.md). This is
only what is left, so you can pick it up cold.

**Shipped:** phases 1 and 2 in full, and most of phase 3. `site_content`
(migration 009), `getContent` cached under `CONTENT_TAG`, `t()`, the
`/admin/content` editor with audit-logged saves, a markdown renderer with
no new dependency, and **107 keys live** — 38 of them markdown — covering
home, track, navigation, footer and all four legal pages.

The load-bearing property, re-verified after each batch: the defaults in
`src/content/defaults.ts` *are* the site, and `site_content` is only an
override. `test:db-down` passes 20/20 with MySQL unreachable, and the legal
text renders from the compiled-in defaults.

### 🟠 Phase 3 remainder — FAQ, About, Contact

The last three pages with editorial copy still hardcoded:

| Page | Size | Prose elements |
|---|---|---|
| `/about` | 221 lines | 14 |
| `/contact` | 148 lines | 5 |
| `/faq` | 92 lines | 2, plus `src/content/faq.ts` (105 lines) |

`/faq` is the awkward one: its answers live in `src/content/faq.ts` as a
typed array that also feeds the FAQ **JSON-LD**. Moving the text to
`site_content` means the structured data starts depending on a database
read, so either the JSON-LD keeps building from the defaults, or `getContent`
has to be threaded into the schema builder. Decide that before touching it —
the SEO rich result is worth more than the editability.

Method that worked for the other batches, and is worth repeating:

1. Add keys to `defaults.ts` with today's exact strings. `CONTENT_LABELS`
   is a total `Record`, so a missing label is a compile error.
2. Bodies get `.body` / `.before` / `.after` suffixes — that is what
   `isMarkdownKey` keys off, and what gives the editor a textarea.
3. Capture the rendered page **before** the change, migrate, capture again,
   and diff **both the visible text and the tag structure**. Text alone is
   not enough: it passed a migration where every `- item` had silently
   become `<li><p>item</p></li>`. Prove the diff can fail first by injecting
   a one-word change.

### 🟠 Phase 4 — the guardrails that stop this decaying

Neither exists yet, and without them the whole thing quietly reverts to
copy-in-JSX.

**Rule 13 in `AGENTS.md`**, wording agreed in `PLAN-cms.md`:

> **13. Visible copy is admin-editable.** Any string a visitor can read
> goes in `src/content/defaults.ts` with a key and is rendered through
> `t()` — never inline in JSX. A new paragraph that ships without a key is
> a review failure, because it can only be changed by a developer, and the
> point of the content table is that copy is not a deployment.

Exempt, deliberately: error messages tied to code paths, legally fixed
strings (the GST "pro-forma — not a tax invoice" heading), `aria-label`s,
structural markup, and anything inside `/admin` — an admin who breaks the
admin's own copy has no way back in.

**`pnpm --filter web check:content`**, added to the pre-flight list, failing
when a `t()` call names a key with no default, or a default has no `t()`
caller. The second half is what catches an orphan before it reaches the
database. A working one-off version of the caller check is in the phase 3
commit message for `5de68f7`.

### 🟡 Product copy is a separate space

`src/content/products.ts` (372 lines) is *not* part of this. Product names
and descriptions are already admin-editable through `/admin/products`,
where they live in MySQL. Do not migrate them into `site_content` — that
would give one product two sources of truth.

### 🟡 What the CMS deliberately does not do

No draft state, no scheduled publishing, no versioning beyond the audit log
and "revert to original", and no per-locale content. The key space would
need a locale dimension; the schema allows adding one later without a
rewrite.

---

## 7. Nice to have

### 🟡 Uptime monitoring

`UPTIME_WEBHOOK_URL` is unset, so alerts go to the console and nowhere
else. A hosted monitor is the better answer regardless — it notices when
the whole machine is gone, which a process on that machine cannot.
UptimeRobot is free; point it at `/api/health`.

### 🟡 `SELLER_FSSAI` is blank

Optional, printed on the invoice only when present. You are selling food,
so it is worth adding.

### ✅ The script budget — closed 2026-08-10

Kept as a record because the wrong answer was written down here twice, and
both times it looked convincing.

The first entry said the pages were "roughly double" their budget, from a
local `next start` run reporting 371 KB. That was measuring uncompressed
bytes: `next start` served no `Content-Encoding`. The second entry
corrected it to 209 KB against production brotli and blamed
`@vercel/analytics`. That was also wrong — the packages are one 10.8 KB
compressed chunk, and removing them from the initial bundle changed the
total by 0.5 KB, because Turbopack simply re-chunked around the gap.

What was actually happening, found by comparing the archived Lighthouse
reports from two CI runs rather than re-measuring locally:

| Page | old rule | new rule | run-to-run swing |
|---|---|---|---|
| `/` | 193.4 / 183.3 | 193.4 / 190.8 | 10.1 → **2.5 KB** |
| `/products` | 185.4 / 193.4 | 190.7 / 193.4 | 8.0 → **2.7 KB** |
| `/products/[slug]` | 188.6 / 188.6 | 196.5 / 196.5 | 0.0 → **0.0 KB** |
| `/blog/*` | 189.3 / 181.3 | 189.3 / 186.6 | 8.0 → **2.7 KB** |

Both runs pulled an **identical list of 17 chunks**. Nothing regressed.
The entire 10 KB swing was two requests that one run counted and the other
reported with `transferSize: 0` — the exact noise `scripts/audit.mjs` has
always documented in its own comment, while the gate went on summing
straight through it.

The consequence nobody had noticed: every page was already over 190 KB on
an honest count and had been passing on bytes that were never added up.

Fixed by counting the dropped requests at the compression ratio the same
run measured on the scripts it did report, and re-baselining the budgets to
198/198/202/194. The full working is in the history comment in
`apps/web/scripts/audit.mjs`, which is where it will be read next.

**The lesson worth keeping:** a local audit is not comparable to CI. Local
`next start` does not compress the same way, and `.env.local` carries a
Sentry DSN that CI does not — which alone put a 186 KB chunk in one local
measurement. Compare archived CI reports against each other, and compare
the chunk *list* before believing any total.

### 🟡 Performance score is no longer a CI gate

`performance` still fails a local `pnpm --filter web audit` at < 90. In CI
it is printed and not gated, because five consecutive runs across commits
that changed no client code scored 95, 97, 68, 95 and 65 — the 65 and 68
runs pulling byte-identical chunk lists to the 95s.

Not a permanent verdict. If the project ever gets a dedicated runner, or
Lighthouse-CI with a median-of-N, this should become a hard gate again. The
reproducible gates — script bytes, accessibility, SEO, best practices —
still fail the build.
