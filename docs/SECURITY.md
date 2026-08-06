# Security and privacy

This shop takes names, addresses, phone numbers and money. The rules below
are not ceremony; each one is here because the alternative has a name.

---

## Secrets

- **Only ever from the environment.** No key, token, password or GSTIN is
  committed, and there are no placeholder credentials anywhere — a
  placeholder GSTIN is one bad merge from a fabricated tax document.
- `.env*` is git-ignored except `.env.example`, which lists every variable
  with an empty value and a comment on what it unlocks.
- `src/lib/env.ts` is the only server-side reader of `process.env`, and it
  validates: a Razorpay key must start `rzp_`, a GSTIN must match the
  15-character format, a Sentry DSN must be an `https://` URL. A value that
  looks like `changeme` or `your-key-here` counts as **absent**.
- `NEXT_PUBLIC_*` is compiled into the browser bundle. Anything there is
  public. Read it directly in client components; never route a server
  secret through one.
- A leaked key is rotated at the provider, not renamed.

## Authentication and authorisation

Two independent identities, deliberately:

**Customers** hold a signed HMAC cookie carrying a verified email, obtained
at `/track` with an order reference plus that email. There is no
registration and there must never be one. The cookie is `httpOnly`,
`sameSite=lax`, `secure`, 30 days, signed with `SESSION_SECRET`.

> Without `SESSION_SECRET` the app generates one per process — every restart
> signs every customer out, and two instances cannot read each other's
> cookies. It is the one variable that must be set in production.

**The owner** signs in through Clerk, and only `/admin` and `/api/admin` are
gated. `requireAdmin()` calls `notFound()` — **404, not 403** — when Clerk
is absent or the role is missing, so an unauthenticated visitor cannot
confirm the surface exists.

### Scope every read to the session, never to a parameter

```ts
const { email } = await requireAccount();       // from the signed cookie
const orders = await listOrdersByEmail(email);  // never req.query.email
```

Address queries include `customer_id` in the `WHERE` even where the address
id alone is unique. That makes "you can only touch your own" a property of
the query rather than of the caller remembering.

Order lookup is compared with `timingSafeEquals`, and a wrong email and a
wrong reference produce **the same message**. A different one is an oracle.

## Input

- **Zod at every boundary** — route handlers, server actions, job endpoints.
  The client validates with the same schema for the message, never for the
  decision.
- Never trust a client-sent price, discount or total. The checkout
  transaction recomputes everything from rows it holds a lock on. The cart
  sends variant ids and quantities; a coupon sends its code and nothing
  else.
- Parameterised SQL only. See `docs/DATABASE.md` for the single `LIMIT`
  exception and the clamp it requires.
- `dangerouslySetInnerHTML` appears exactly once, for a constant defined in
  the same file. Anything derived from a request must not go near it.

## Rate limiting and abuse

| Route | Limit |
|---|---|
| `/api/account/lookup` | 5/min — the strictest, because it is guessable in principle |
| `/api/checkout` | 10/min |
| `/api/back-in-stock` | 10/min |
| everything else under `/api` | 60/min |
| `/api/health`, `/api/payment/webhook` | exempt — uptime probes and Razorpay retries must never be throttled |

Applied in `src/proxy.ts`. **Buckets are per-process without Redis** — set
`REDIS_URL` before running more than one replica, or four containers enforce
four separate limits.

The limiter keys on the forwarded IP. nginx overwrites `X-Real-IP` with
`$remote_addr`, so behind the edge profile it is trustworthy; **exposed
directly, a client can choose its own bucket.** Run it behind the proxy.

Also in place: Cloudflare Turnstile on checkout, lookup, contact and
newsletter (inert without keys); a honeypot field plus a timing check that
works with no JavaScript; double opt-in on the newsletter so nobody can
subscribe somebody else.

## Payments

- The Razorpay webhook signature is verified before the body is parsed.
- `orders.razorpay_payment_id` is uniquely indexed, so a replayed webhook
  cannot record a second payment.
- Order ids are ULIDs — 26 characters, not sequential. A guessable order id
  is an enumeration of everybody's addresses.
- COD is the default and works with no keys at all.

## Headers

`next.config.ts` sets CSP, HSTS (2 years, preload), `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy`.

**There is no CSP nonce, deliberately.** A per-request nonce forces every
page to be dynamic, and this site's whole load story is that browsing is
static. `'unsafe-inline'` stays in `script-src` and the origin allowlist
does the work — an injected `<script src>` pointing anywhere but this origin
or Razorpay is still refused. The directives that are *not* weakened are the
ones that matter most here: `frame-ancestors 'none'`, `object-src 'none'`,
and `form-action 'self'`, which means a successful injection still cannot
post a filled checkout form to somebody else's server.

`worker-src` and `manifest-src` are stated explicitly even though they fall
back to `default-src`, so a future tightening cannot silently stop the
service worker registering.

## Uploads

Presigned `PUT` straight to S3-compatible storage; the bytes never touch
this server.

- The object key is generated server-side from 12 random bytes. Nothing the
  client sends becomes part of the path — no traversal, no overwriting a
  photograph by guessing its name.
- `content-type` is **signed**, so a URL issued for a JPEG cannot accept an
  HTML document.
- **SVG is refused.** It is an XML document that may contain `<script>`, and
  serving one from a host near your own is a stored XSS.
- 6 MB ceiling, five-minute expiry. A presigned URL is a bearer credential.

## Exports

Every CSV cell is guarded against **formula injection**. A value beginning
`=`, `+`, `-`, `@`, tab or CR is executed on open by Excel, LibreOffice and
Google Sheets, and an export is exactly the path that carries customer
names, addresses and free text out of the site and into a spreadsheet.
`src/lib/csv.ts` prefixes such a cell with an apostrophe — after checking it
is not simply a negative number, which would otherwise break every sum.

Exports are `Cache-Control: no-store, private`, and the filename is
sanitised so a stray quote cannot inject a header.

## Privacy — DPDP Act 2023

- **Consent is the load condition, not a filter.** `AnalyticsLoader` does
  not fetch PostHog until analytics consent exists. Deny is the default; the
  banner has real per-category toggles and a persistent way to change the
  decision.
- Data export and erasure from `/account/privacy`.
- **Erasure anonymises orders rather than deleting them** — they are
  financial records with a retention period — and deletes reviews, the
  newsletter row and back-in-stock requests, which are not. Coupon
  redemptions are anonymised per order so erased customers do not collapse
  into one apparent person.
- Placing an order is **not** consent to marketing. Only
  `customers.marketing_opt_in` and a confirmed newsletter row are.
- A grievance officer is named on `/contact` from the environment. Unset,
  the page says one has not been appointed yet rather than inventing a name
  on a statutory notice.

## The audit log

Every admin write records actor, action, entity and the before/after.
`src/db/queries/audit.ts` exports **one writer and two readers, and no
update or delete** — a log the application can rewrite is not evidence of
anything. `recordAdminAction` never throws: it records work already
committed, so a logging failure must not turn a saved edit into an error the
owner retries.

Never put a secret, a session token or a customer's address in it. An
identifier is enough to find the record; the record already exists
elsewhere, and every copy is a place data can leak from.

## Before you open a PR

- [ ] No secret, key or credential in the diff — including tests and fixtures
- [ ] Every new query parameterised
- [ ] Every new input validated with Zod on the server
- [ ] Any new route that reads customer data scopes to the session
- [ ] Any new external origin added to the CSP, and `npm run test:consent` passes
- [ ] `npm run test:consent` and `npm run test:account` green — they cover
      headers, enumeration resistance and session scoping

## Reporting

Found something? Email the address on `/contact` rather than opening a
public issue.

---

## Related

`docs/DATABASE.md` · `docs/ARCHITECTURE.md` · `docs/keys-needed.md` ·
`docs/deploy.md`
