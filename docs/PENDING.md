# Pending work

What is not finished, why it matters, and what "done" looks like. Ordered
by consequence within each section, not by effort.

Last verified against the tree at commit `13af744`. When you close an item,
delete it from this file in the same commit that closes it — a stale
checklist is worse than none, because it gets trusted.

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

## 6. Nice to have

### 🟡 Uptime monitoring

`UPTIME_WEBHOOK_URL` is unset, so alerts go to the console and nowhere
else. A hosted monitor is the better answer regardless — it notices when
the whole machine is gone, which a process on that machine cannot.
UptimeRobot is free; point it at `/api/health`.

### 🟡 `SELLER_FSSAI` is blank

Optional, printed on the invoice only when present. You are selling food,
so it is worth adding.

### 🟡 Performance headroom on two pages

`/products` (3.1 s LCP, perf 94) and `/products/[slug]` (3.4 s, perf 92)
are the slowest pages. Not a regression and both well within budget —
this is simply where the remaining headroom is if it is ever wanted.
Accessibility and SEO are 100 across every audited page.
