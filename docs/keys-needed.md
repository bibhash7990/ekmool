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
| Background jobs | working |
| Emails | composed and recorded in `email_log` as `skipped_no_smtp`, not delivered |

To generate the two local secrets (already done in your `.env.local`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one value for `CRON_SECRET` and a different one for `REVALIDATE_SECRET`.

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
