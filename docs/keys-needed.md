# API keys — what to sign up for, and what each one unlocks

The site is built so that **none of these are required**. With only a database
and the two local secrets, you can run it, browse it, and take Cash on Delivery
orders end to end. Every service below is additive: paste its keys into
`.env.local`, restart, and that feature switches itself on.

Nothing here is urgent. Do them in the order that matches what you need next.

---

## Already working, no signup needed

| Capability | Status |
|---|---|
| Whole public site, all 18 pages | working |
| Product catalogue, prices, stock | working |
| Cart and checkout | working |
| **Cash on Delivery orders** | working |
| Order confirmation page | working |
| **Order tracking, history, cancellation** | working — `/track`, no auth provider involved |
| **Customer account** — orders, profile, saved addresses | working — `/account`, same session, no Clerk |
| **Invoices, returns, re-order** | working — invoices print pro-forma until section 6 is filled in |
| **Admin: products, packs, prices, stock, coupons, reviews, returns, reports** | working — but the admin itself needs Clerk, section 3 |
| Admin photograph *upload* | needs section 9; without it, attach a path under `public/images/` |
| Background jobs | working |
| **Installable PWA, offline browsing, offline COD orders** | working — no keys, no service |
| **Nightly verified backups** | working — kept on disk; section 9 adds off-site |
| Rate limiting | working, but **per-process**. Set `REDIS_URL` before running more than one replica, or four containers enforce four separate limits |
| Emails | composed and recorded in `email_log` as `skipped_no_smtp`, not delivered |

To generate the local secrets (already done in your `.env.local`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use a different value for each of `CRON_SECRET`, `REVALIDATE_SECRET` and
`SESSION_SECRET`.

`SESSION_SECRET` signs the customer session cookie set at `/track`. It is the
one variable here you should not leave blank in production: without it the
app generates a secret per process, so every restart signs every customer
out, and two instances behind a load balancer cannot read each other's
cookies. It is not a signup — just 32 random bytes.

---

## 1. Brevo — transactional email

**Unlocks:** order confirmation, shipping notification, abandoned-payment
reminder, and low-stock alerts actually reaching inboxes.

**Why this one first:** it is free for 300 emails/day, and it is the only
missing piece that a real customer would notice.

1. Sign up at <https://www.brevo.com> (free tier).
2. Go to **SMTP & API → SMTP**.
3. Copy the **SMTP login** and **SMTP key** (the key is shown once).
4. Fill in `.env.local`:

```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<your SMTP login>
SMTP_PASSWORD=<your SMTP key>
MAIL_FROM="Ekmool <orders@yourdomain.com>"
```

**DNS records** — required before Gmail and Outlook will trust your mail.
Brevo shows the exact values under **Senders & Domains → Domains**; add them at
your DNS provider:

| Type | Host | Value |
|---|---|---|
| TXT | `@` | `v=spf1 include:spf.brevo.com mp.a1.brevo.com ~all` |
| TXT | `brevo._domainkey` | (the DKIM value Brevo generates for you) |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:you@yourdomain.com` |

Start DMARC at `p=none` and only tighten to `quarantine` once Brevo reports
that SPF and DKIM are passing.

**Verify:** place a test COD order, then check that the `email_log` row says
`sent` rather than `skipped_no_smtp`:

```bash
docker exec ekmool-mysql mysql -uekmool -pekmool_dev ekmool -e "SELECT template, recipient, status, created_at FROM email_log ORDER BY id DESC LIMIT 5;"
```

---

## 2. Razorpay — online payment

**Unlocks:** the "Pay online" option at checkout (UPI, cards, net banking,
wallets). Until then checkout offers Cash on Delivery only, with a quiet
"coming soon" note.

1. Sign up at <https://razorpay.com> and stay in **Test Mode** for now.
2. **Settings → API Keys → Generate Test Key**. Copy both halves.
3. **Settings → Webhooks → Add New Webhook**:
   - URL: `https://yourdomain.com/api/payment/webhook`
   - Active events: `payment.captured`, `payment.failed`, `order.paid`
   - Set a **secret** and copy it.
4. Fill in `.env.local`:

```
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=<the webhook secret you chose>
```

**Testing locally:** Razorpay cannot reach `localhost`, so expose the port with
a tunnel (`cloudflared tunnel --url http://localhost:3000`) and use the public
URL as the webhook target.

**Test card:** `4111 1111 1111 1111`, any future expiry, any CVV.

**Verify:** `npm run test:checkout` exercises the webhook signature path
automatically once `RAZORPAY_WEBHOOK_SECRET` is set — including that a replayed
webhook is a no-op.

**Going live:** switch to Live Mode keys only after KYC is approved. The key id
prefix changes from `rzp_test_` to `rzp_live_`; nothing in the code changes.

---

## 3. Clerk — admin login

**Unlocks:** `/admin` (order management, status updates, tracking ids) and
`/admin/stock`. Without it those routes return **404** — deliberately, so their
existence is not advertised. **Guest checkout is never affected.**

Clerk is for **you**, not your customers. The customer account at `/account`
runs entirely on the order-lookup session and needs no keys at all; a
configured Clerk account is merely accepted as a second way in, matched to
the same customer by its verified email address.

1. Sign up at <https://clerk.com> and create an application.
2. Enable **Email** as a sign-in method. You do not need social logins.
3. **API Keys** → copy the publishable and secret keys:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxx
```

4. **Configure → Sessions → Customize session token**, and set the claims to:

```json
{ "metadata": "{{user.public_metadata}}" }
```

   This step is not optional. The admin gate reads
   `sessionClaims.metadata.role`, and without this customisation that claim is
   never present, so every user — including you — is treated as a non-admin.

5. Create your own user (sign up at `/admin` once the keys are in), then in the
   Clerk Dashboard open **Users → your user → Metadata → Public metadata** and
   set:

```json
{ "role": "admin" }
```

6. Sign out and back in so a fresh session token is issued.

**Verify:** `/admin` should load for you and return 404 for a second user who
does not carry the role.

---

## 4. Sentry — error monitoring

**Unlocks:** being told when something breaks in production, with the route and
order reference attached.

1. Sign up at <https://sentry.io>, create a **Next.js** project.
2. Copy the DSN from **Settings → Client Keys (DSN)**.

```
NEXT_PUBLIC_SENTRY_DSN=https://xxxxxxxx@oNNNNNN.ingest.sentry.io/NNNNNNN
```

3. Optional, for readable stack traces on deploy — **Settings → Auth Tokens**,
   create a token with `project:releases` scope:

```
SENTRY_AUTH_TOKEN=sntrys_xxxxxxxx
```

Without a DSN, Sentry never initialises and ships no JavaScript at all.

---

## 5. PostHog — product analytics

**Unlocks:** the six tracked events (`product_viewed`, `variant_selected`,
`add_to_cart`, `begin_checkout`, `purchase_completed`, `payment_failed`).

1. Sign up at <https://posthog.com> (US cloud — the `/ingest` proxy in
   `next.config.ts` points at `us.i.posthog.com`; change both rewrite
   destinations to `eu.i.posthog.com` if you pick the EU region).
2. **Project Settings → Project API Key**:

```
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxx
```

Requests are proxied through `/ingest` on your own domain, so ad-blockers do
not silently drop your analytics. Session recording is off by default and we
recommend leaving it that way for a checkout flow.

---

## 6. Your own GST registration — tax invoices

Not a signup with anyone here, but it belongs in this list because it is the
last thing standing between the invoice page and a document your customer's
accountant will accept.

```
SELLER_LEGAL_NAME=Ekmool Foods Private Limited
SELLER_GSTIN=29ABCDE1234F1Z5
SELLER_STATE=Karnataka
SELLER_ADDRESS=12 MG Road, Bengaluru, Karnataka 560001
SELLER_FSSAI=10012345678901
```

**All four of the first four, or none of them.** They are a single switch
that decides two things at once: whether GST is recorded against an order,
and whether `/orders/<id>/invoice` is a tax invoice.

That is one switch rather than two because s.32 of the CGST Act forbids an
unregistered person from collecting tax. Without a registration your shop
charges no GST, so there is no split to record and nothing to print — and a
document headed *"not registered"* that showed a CGST/SGST breakdown anyway
would be describing a transaction that never happened.

`SELLER_STATE` must match a state name in the checkout dropdown exactly: it
is what distinguishes CGST + SGST (buyer in your state) from IGST (buyer
elsewhere). `SELLER_FSSAI` is optional and printed only when present.

Leave the identity unset and the invoice prints headed **pro-forma — not a
tax invoice**, with no tax columns at all. It still reconciles to the paise,
so it is a perfectly good receipt in the meantime. Nothing here will invent a
GSTIN to fill the gap.

**Setting it later does not backdate.** Orders placed while you were
unregistered stay untaxed, and their invoices stay pro-forma. That is the
correct outcome — no GST was collected on them — and it is why the split is
snapshotted onto each order at checkout rather than computed at print time.

Invoice numbers are allocated **lazily**, the first time an invoice is
actually rendered — never at checkout, because a cancelled order would burn a
number and a gap in a GST series is a question you do not want to answer. The
series is `EK/<financial year>/<six digits>`, consecutive within each Indian
FY (1 April – 31 March), allocated under `SELECT ... FOR UPDATE`.

> **Rates and HSN codes are seeded at 5% in migration 003 as a starting
> point, not as settled fact.** Confirm both with your CA before you issue a
> real tax invoice. This project does the arithmetic; it does not give tax
> advice.

---

## 7. Cloudflare Turnstile — CAPTCHA

**Unlocks:** a bot check on checkout and on order lookup.

Free at any volume, and it shows a real customer no puzzle — no traffic
lights, no crosswalks, usually nothing at all. It needs no npm dependency
either: a script tag and one `fetch` from the server.

1. Sign up at <https://dash.cloudflare.com> → **Turnstile** → **Add widget**.
2. Add your domain (and `localhost` if you want it in development).
3. Widget mode **Managed** is the right default.

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...
TURNSTILE_SECRET_KEY=0x4AAAAAAA...
```

**Both halves or neither.** One without the other is a misconfiguration and
the code treats it as unconfigured rather than half-enforcing something.

Unset, no widget renders and no verification call is made. The **honeypot**
still runs on both forms either way — it costs nothing, catches the naive
bots that make up most of the noise, and cannot produce a false positive
because no human can type into a field that is out of the layout, out of the
tab order and hidden from screen readers.

If Cloudflare is unreachable or returns an error, verification **fails
open**: the shop stays up, and the honeypot and rate limiter still apply.
Taking checkout down because someone else's service is having a bad day is
the wrong failure mode for a shop.

---

## 8. Your grievance officer

Not a signup either, and unlike everything else in this file it is not
optional if you intend to trade.

Rule 4(5) of the **Consumer Protection (E-Commerce) Rules 2020** requires
every e-commerce entity to appoint a grievance officer and display their
**name** and contact details on the site, to acknowledge a complaint within
48 hours, and to resolve it within one month. The **DPDP Act 2023** wants a
contact point for data grievances, which for a shop this size is the same
person.

```
GRIEVANCE_OFFICER_NAME=Priya Menon
GRIEVANCE_OFFICER_EMAIL=grievance@ekmool.com
GRIEVANCE_OFFICER_PHONE=+91 80 4123 4567
```

Name and email are the minimum; the phone number is shown when set. The
notice appears on `/contact` and is linked from the footer of every page,
with the statutory timelines stated as commitments and the National Consumer
Helpline given as the escalation route.

Leave it unset and the page says no officer has been appointed yet, points
at `orders@ekmool.com`, and keeps the timelines. That is deliberate — an
invented name on a statutory notice would be worse than the gap it hides —
but **it is still a gap**. Fill it in.

---

## 9. Cloudflare R2 — photographs uploaded from the admin

**Cost:** free up to 10 GB of storage and a generous request allowance, and
**no egress charge at all**, which is the reason to prefer it to S3 for a
shop serving images to the public.

Without it the admin still manages photographs — it just cannot accept a
file. You add the image under `public/images/products/` in the repository
and give its path, which is exactly how the five launch products work. The
file picker appears only once storage is configured; an upload control that
fails when used would be worse than one that is honestly absent.

1. Cloudflare dashboard → **R2** → *Create bucket*. Name it `ekmool-media`.
2. **Settings** on the bucket → *Public access*. Either connect a custom
   domain (`media.ekmool.com`) or enable the `r2.dev` subdomain. Whichever
   you choose is `S3_PUBLIC_BASE_URL` — it is where a browser reads the
   image from, and it is a different host from the one you upload to.
3. R2 → **Manage API tokens** → *Create API token*, scoped to **Object Read
   & Write** on that one bucket. Not account-wide: this token is handed to a
   web server.
4. The token screen shows an **S3 endpoint** of the form
   `https://<account-id>.r2.cloudflarestorage.com`. That is `S3_ENDPOINT`.

```
S3_ENDPOINT=https://a1b2c3d4.r2.cloudflarestorage.com
S3_BUCKET=ekmool-media
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_PUBLIC_BASE_URL=https://media.ekmool.com
S3_REGION=auto
```

All five or none — a partial set counts as unconfigured.

**No SDK was added for this.** `@aws-sdk/client-s3` plus the presigner is
around forty packages to produce one signed URL, and the signature is a
documented HMAC chain that `node:crypto` already has. `src/lib/storage.ts`
implements Signature Version 4 in about a hundred lines. Any S3-compatible
endpoint that accepts path-style addressing will work — MinIO and Backblaze
B2 both do, and so does AWS S3 itself.

Two things it deliberately refuses. **SVG**, because an SVG is an XML
document that may contain `<script>`, and serving one from a host near your
own is a stored XSS. And **a client-chosen object key** — the key is
generated server-side from twelve random bytes, so there is no traversal to
attempt and no existing photograph to overwrite by guessing its name. The
signed URL also covers the `Content-Type` header, so a URL issued for a
JPEG cannot be used to upload an HTML page.

---

## Where the values go

- **Local development:** `.env.local` (git-ignored). `.env.example` is the
  committed template listing every variable.
- **Vercel:** Project → Settings → Environment Variables. Anything starting
  `NEXT_PUBLIC_` is baked into the client bundle at build time, so a change
  needs a redeploy.
- **VPS:** put them in the PM2 ecosystem file or a root-owned `.env` readable
  only by the app user. See `docs/deploy.md`.

Never commit real keys. If one leaks, rotate it at the provider — every one of
these can be regenerated in under a minute.
