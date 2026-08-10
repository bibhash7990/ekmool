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
- `apps/web/src/lib/env.ts` is the only server-side reader of `process.env`, and it
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

**The same customer on a phone** holds the same token in the platform
keystore and sends it as `Authorization: Bearer …`. It is minted by
`POST /api/v1/session` against the same proof — reference plus email — and
verified by the same `verifySession`: one signature, one secret, one expiry
rule, and the transport is the only difference. `resolveSession(headers)`
reads either door, and `getCustomerEmail(headers)` is the single funnel
every account route comes through.

> Returning that token in a JSON body looks like giving up what `httpOnly`
> buys, and it is not. `httpOnly` keeps a token away from script an XSS
> injected; minting this one needs the order reference **and** the email,
> which such an attacker does not have — and if they can phish both they do
> not need the XSS. What must never exist is an endpoint that returns a
> token for a session that already exists. `/api/v1/session` never reads the
> cookie and never sets one, and there is deliberately no "exchange my
> cookie for a token" route. Adding one would turn every XSS into a
> thirty-day credential that outlives the tab.

There is no server-side revocation. The token is stateless by design, so
signing out on a phone is deleting the keystore entry; a revocation list
would be the first piece of session state in a system that has none. The
trade accepted is the 30-day expiry. Same as the cookie, which cannot be
revoked either.

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
`/api/v1/session` duplicates those twenty lines rather than sharing them —
deliberately, because the property that makes them correct is a timing and
response-shape property, and a shared helper makes every future edit to the
app's door an edit to the browser's door as well. `test:mobile-api` asserts
the two failures are byte-identical from the new route too.

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
| `/api/account/lookup`, `/api/v1/session` | 5/min — the strictest, because it is guessable in principle |
| `/api/checkout` | 10/min |
| `/api/back-in-stock` | 10/min |
| everything else under `/api` | 60/min |
| `/api/health`, `/api/payment/webhook` | exempt — uptime probes and Razorpay retries must never be throttled |

Applied in `apps/web/src/proxy.ts`. **Buckets are per-process without Redis** — set
`REDIS_URL` before running more than one replica, or four containers enforce
four separate limits.

The limiter keys on the forwarded IP. nginx overwrites `X-Real-IP` with
`$remote_addr`, so behind the edge profile it is trustworthy; **exposed
directly, a client can choose its own bucket.** Run it behind the proxy.

### Install ids, and what they are not

A request carrying a well-formed `X-Ekmool-Install` (32 hex characters) is
metered on **two** buckets on the two lookup routes and refused if either
refuses: 5/min for the install, and a separate 60/min for the IP. Anything
that is not exactly 32 hex characters is treated as absent, so a malformed
header can never be a way into the looser bucket.

> **An install id is not a security boundary and must not be described as
> one.** The client generates it, so a determined attacker mints a new one
> per request and walks straight past the per-install bucket. It is a
> *fairness* mechanism: mobile carriers put very large numbers of
> subscribers behind one address, and on a 5/min route the second customer
> to look up an order in a minute is refused for what the first one did.
> The security boundary is the IP bucket, which stays — loosened to 60/min,
> which is still hopeless against an eight-character reference.

`/api/checkout` deliberately **keeps its IP bucket unchanged, key and all**.
Loosening it would hand any browser bot more order throughput for the price
of a forgeable header, and on a deployment with no Turnstile keys — which
this project treats as first-class — that minute bucket is the only volume
brake there is.

### Turnstile does not cover the app

Cloudflare Turnstile runs on checkout, lookup, contact and newsletter, inert
without keys, alongside a honeypot field that works with no JavaScript, and
double opt-in on the newsletter so nobody can subscribe somebody else.
(There is deliberately **no** timing check — a returning customer using
autofill submits in well under a second, and wrongly refusing a real order
costs more than letting a bot reach a limiter that is already watching.)

**None of that reaches a native client**, and pretending otherwise would be
worse than the gap. A phone has no widget to render and no form to hide a
honeypot in. So a request that declares itself native *and* carries an
install id may skip the challenge on `/api/checkout`, and pays for it:

| | Browser | Native-declared |
|---|---|---|
| Challenge | mandatory | skipped |
| Orders per IP | 10/min → 600/hour | **10/hour** |
| Orders per install | — | **3/hour** |

The header is forgeable, which is exactly why the trade is priced rather
than trusted. Solved challenges go for about a dollar per thousand, so a
solver at today's limit could place 600 orders an hour from one address;
claiming native caps the same address at 10. **A bot that wants volume is
worse off claiming native than solving Turnstile**, and that — not the
header — is what makes it safe to act on. A refused native checkout returns
the same generic message as any other refusal, so a prober cannot tell which
dial it hit.

What actually protects checkout is unchanged and is not the challenge: the
transaction recomputes every price from rows it holds a lock on, the stock
decrement is atomic, `Idempotency-Key` plus a unique index turns a replay
into the original order, and `orders.razorpay_payment_id` is uniquely
indexed.

Play Integrity and App Attest are the correct long-term answer and are
deliberately **not** attempted yet. Each is a config plugin, a server
verification path, a key to manage and a new documented inert state for when
that key is absent — its own milestone, and half-building it would buy the
appearance of attestation without the fact.

## Payments

- The Razorpay webhook signature is verified before the body is parsed.
- `orders.razorpay_payment_id` is uniquely indexed, so a replayed webhook
  cannot record a second payment.
- Order ids are ULIDs — 26 characters, not sequential. A guessable order id
  is an enumeration of everybody's addresses.
- COD is the default and works with no keys at all.

## Headers

`apps/web/next.config.ts` sets CSP, HSTS (2 years, preload), `X-Frame-Options`,
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
`apps/web/src/lib/csv.ts` prefixes such a cell with an apostrophe — after
checking it is not simply a negative number, which would otherwise break
every sum.

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
`apps/web/src/db/queries/audit.ts` exports **one writer and two readers, and no
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
- [ ] Any new route that reads customer data scopes to the session — via
      `resolveSession(request.headers)` or `getCustomerEmail(request.headers)`,
      so the phone gets in through the same funnel and not a second one
- [ ] Any new external origin added to the CSP, and
      `pnpm --filter web test:consent` passes
- [ ] `pnpm --filter web test:consent` and `pnpm --filter web test:account`
      green — they cover headers, enumeration resistance and session scoping
- [ ] `pnpm --filter web test:mobile-api` green if the change touches
      sessions, the limiter or the catalogue documents

## Reporting

Found something? Email the address on `/contact` rather than opening a
public issue.

---

## Related

`docs/DATABASE.md` · `docs/ARCHITECTURE.md` · `docs/keys-needed.md` ·
`docs/deploy.md`
