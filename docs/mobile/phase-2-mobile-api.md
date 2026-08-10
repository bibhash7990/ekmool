# Phase 2 — The mobile API surface

**Deliverable:** everything a native client needs from the server, added to
the existing Next application, without moving a single route out of the row
it occupies in `docs/ARCHITECTURE.md`'s rendering table.

**Not in this phase:** React Native. This is server work, testable with
`curl`, and it must be finished and green before the app exists — otherwise
every mobile bug has two possible homes.

**The governing constraint.** The web app's most valuable property is that
browsing is static and survives MySQL being down; `scripts/chaos.mjs` stops
the database under live traffic and asserts browsing keeps serving 200s.
**A phone must inherit that property, not consume it.** An endpoint that
reads MySQL to serve a product list would make the app the first thing to
fail in an outage, and it would do it while the website beside it stayed up.

---

## 1. The catalogue document

### Where it lives, and why not under `/api`

```
GET /catalog/v1.json          the catalogue
GET /catalog/reviews-v1.json  published reviews
GET /catalog/content-v1.json  editorial and legal copy
```

Not `/api/v1/catalog`. Three reasons:

1. **`src/proxy.ts`'s matcher is `/api/:path*`.** Its own header says it is
   "deliberately narrow: the matcher excludes every public page, so browsing
   paths are served straight from the static/ISR cache and never pay for
   this hop". The catalogue is a browsing path. Putting it under `/api`
   would make every catalogue fetch pay for a Node hop and a rate-limit
   check to serve a file that never changes between purges.
2. **The architecture doc sorts routes by what they touch at request time.**
   These belong in row one — *static, `revalidate = 3600`, does not touch
   MySQL* — beside `/` and `/products`. Filing them under `/api/*`, whose
   row says "yes, where relevant", puts them where a future reader will
   assume they are dynamic and add a query to one.
3. Rate limiting a static file is theatre. It is served from disk; the
   protection it needs is a CDN, not a token bucket.

### How it stays static

```ts
// apps/web/src/app/catalog/v1.json/route.ts
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const products = await getCatalog();          // unstable_cache, tag: products
  const body = JSON.stringify(toCatalogDocument(products));
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      etag: `"${sha256(body).slice(0, 32)}"`,
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
```

`getCatalog` is already `unstable_cache(loadCatalog, ["catalog"], { tags:
[PRODUCTS_TAG], revalidate: 3600 })`. So this route is built once at build
time, served from static output, and purged by the existing
`revalidateCatalog()` — the same call an admin stock edit already makes. **No
new invalidation story.** That is the entire reason for reusing `getCatalog`
rather than writing a leaner query for the phone.

Rule 9 applies with full force: **`revalidateTag(PRODUCTS_TAG)`, never
`revalidatePath("/catalog/v1.json")`.** A path purge deletes the entry, and
the app's only source of products with it.

### The ETag is the bandwidth story

The app sends `If-None-Match`; an unchanged catalogue answers `304` with no
body. A customer opening the app four times a day on a metered connection
downloads the catalogue once. This is worth more than any amount of payload
trimming, and it costs one header.

The ETag must be a **hash of the body**, not a build id or a timestamp. A
build id changes on every deploy including deploys that do not touch the
catalogue, and then every install re-downloads it for nothing.

### What goes in the document

The `Product` shape from `@ekmool/core` — id, slug, name, origin, GI tag,
descriptions, accent, variants, images. Plus:

- **A `generatedAt` timestamp**, so a support conversation can establish how
  stale a phone's copy is.
- **Nothing derived.** No "bestseller", no "popular", no rating rolled in
  from reviews. Rule 5. If a badge is not literally true from a column, it
  does not exist, and the surest way to fabricate social proof is to invent
  a ranking field in a document nobody reviews.
- **Stock quantities, as they are.** The app shows "3 left" only when the
  number is literally 3 — and it shows it from an hourly-stale document, so
  the phrasing has to be honest about that. The web already accepts this
  trade: `docs/PERFORMANCE.md` says stock display refreshes on the ISR
  window and correctness lives in the atomic decrement at checkout, not in
  the display. Same here, and the app must not imply otherwise.

### Reviews and content are separate documents on purpose

`docs/ARCHITECTURE.md`: *"Two tags exist and they are separate on purpose.
Moderating a review must not send every product page back to the database
for catalogue data that has not changed."* A single combined document would
undo that — every moderated review would invalidate the catalogue for every
phone. `reviews-v1.json` is tagged `reviews`, `v1.json` is tagged
`products`, and the app fetches them independently.

`content-v1.json` carries the editorial copy and the four admin-editable
legal pages. Those became admin-editable in the current milestone; the app
needs the same text, and it must come from the same place or the privacy
policy on the phone will diverge from the one on the site, which is a
compliance problem before it is a content problem. It is tagged with
whatever tag `revalidateContent()` uses today.

---

## 2. Sessions for a client with no cookie jar

### What already exists

`src/lib/session.ts` signs `<base64url payload>.<hex hmac>` with
`SESSION_SECRET`, where the payload is `{ e: email, x: expiry }`. It is
"signed, not encrypted. It contains an email address the holder already
knew". `attachSession` puts it in an `httpOnly` cookie.

**The token is already the right shape for a bearer credential.** Only the
transport is browser-specific.

### The change

```
POST /api/v1/session      { reference, email } → { token, expiresAt, email }
```

Same proof as `/api/account/lookup`: the eight-character order reference and
the email the order was placed with, compared with `timingSafeEquals`,
producing **the same failure message for a wrong reference and a wrong
email**, because a different one is an oracle. That property is load-bearing
and must be copied, not re-derived.

Then, server-side, one function replaces `getSession()` at every call site:

```ts
/**
 * The signed-in customer, from either door.
 *
 * A browser sends the httpOnly cookie. A native client has no cookie jar
 * worth relying on, so it sends the same signed token as a bearer header
 * and holds it in the platform keystore. Both verify through verifySession;
 * there is one signature, one secret and one expiry rule.
 */
export async function resolveSession(req: Request): Promise<Session | null> {
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  return verifySession(bearer) ?? (await getSession());
}
```

### Why handing the token to a client in a response body is safe here

`httpOnly` exists to keep a token away from JavaScript that an XSS injected.
Emitting the same token in a JSON body appears to give that up. It does not,
for a specific reason that must be in the comment:

> Minting this token requires the order reference **and** the email. An
> attacker with script execution on our origin does not have those — they
> would have to phish them, and if they can phish them they do not need the
> XSS. What the endpoint must never do is return a token for a session that
> already exists; it only ever issues one against fresh proof.

So: `POST /api/v1/session` is a **separate route from `/api/account/lookup`**
and never reads the cookie. There is no "exchange my cookie for a token"
endpoint, and adding one later would be the mistake this paragraph exists to
prevent.

Rate limit it at 5/min, exactly as lookup is, and for the same reason.

### On the phone

`expo-secure-store` — Keychain on iOS, EncryptedSharedPreferences on
Android. Not `kv-store`, which is a plain SQLite file readable on a rooted
device. Sign-out deletes it. Expiry is 30 days and the client must handle a
`401` by clearing the token and returning to the lookup screen rather than
retrying, or it will loop.

---

## 3. Rate limiting and the carrier-NAT problem

### The problem, stated precisely

`limitsFor()` gives `/api/account/lookup` 5 requests per minute and keys the
bucket on the forwarded IP. Mobile carriers put very large numbers of
subscribers behind one address. Two customers on the same network looking up
their orders in the same minute is not a hypothetical, and the second one
gets a 429 that the copy will explain as "too many requests" when they made
one.

The web does not have this problem to the same degree, because a browser
session on a home connection is one household.

### The answer, and its honest limits

Issue an **install id** on first launch: 16 random bytes from
`expo-crypto`, stored in `expo-secure-store`, sent as `X-Ekmool-Install`.
For requests carrying one, the limiter keys on the install id. For requests
without one, it keys on IP exactly as today.

```ts
// src/lib/rate-limit.ts — the comment that must ship with this
//
// An install id is generated by the client, so a determined attacker can
// mint a new one per request and walk straight past the per-install bucket.
// It is NOT a security boundary and must not be described as one.
//
// It is a fairness mechanism. Its job is that two honest customers behind
// one carrier NAT do not take each other's tokens. The security boundary is
// the outer IP bucket, which stays — loosened, because it is now protecting
// against volume rather than against a single guesser, and tightened where
// it matters by the fact that /api/v1/session still needs a reference and
// an email that cannot be guessed at any rate this permits.
```

Concretely: keep the IP bucket on every route, raise it for requests that
also carry an install id (say 5/min per install and 60/min per IP on
`/api/v1/session`), and leave IP-only clients on today's numbers unchanged.
The web's behaviour does not move.

**`test:mobile-api` must assert both directions**: that two distinct install
ids from one IP both succeed, and that one install id hammering the endpoint
is still stopped. The second assertion is the one that would fail against a
naive implementation, which is the test worth writing.

---

## 4. Abuse prevention without Turnstile

`verifyChallenge()` runs on `/api/checkout` and `/api/account/lookup`,
combining a Cloudflare Turnstile token, a honeypot field and a timing check.
On a phone: there is no widget, there is no form to hide a honeypot in, and
a client-supplied timestamp is a number the client chose.

### What is actually protecting checkout

Reading `POST /api/checkout` at first hand, the real defences are not the
challenge:

- The transaction **recomputes every price from rows it holds a lock on**.
  A client-sent total is ignored.
- The stock decrement is **atomic**; an oversell is impossible regardless of
  how many requests arrive.
- The `Idempotency-Key` header plus a unique index means a replay returns
  the original order rather than creating a second one.
- `orders.razorpay_payment_id` is uniquely indexed, so a replayed webhook
  cannot record a second payment.

Turnstile's job is to raise the cost of *volume* — a script placing a
thousand COD orders to fake addresses. That is a real problem and it needs a
real answer on mobile, not a shrug.

### The answer

1. **Keep `verifyChallenge` mandatory for browser clients.** Nothing about
   the web changes. A missing Turnstile token from a browser is still a
   refusal, shaped like every other 400 so a bot learns nothing.
2. **For native clients, substitute a first-order-per-install check plus the
   per-install rate bucket.** A COD order from an install id that has placed
   three orders in an hour is refused with the same generic message.
3. **Do not attempt Play Integrity or App Attest in this phase.** They are
   the correct long-term answer and each is a config plugin, a server
   verification path, a key to manage and a new documented inert state for
   when the key is absent. That is its own milestone. Write the intention
   down in `docs/SECURITY.md`; do not half-build it.
4. **Say so in `docs/SECURITY.md`.** The current text lists Turnstile as
   applying to checkout and lookup. After this phase that is true for
   browsers and not for the app, and a security document that is quietly
   wrong is worse than one that admits a gap.

---

## 5. The bootstrap document — how degradation reaches the phone

The graceful-degradation contract is computed once in `src/lib/env.ts` as
`hasClerk`, `hasRazorpay`, `hasSmtp`, `hasRedis`, `hasObjectStorage`. The
web reads those on the server and renders accordingly. A phone cannot.

```
GET /api/v1/bootstrap
{
  "payments":       { "razorpay": false },     // → COD only, and no broken button
  "minClientBuild": 1,
  "messageForOlderClients": null,
  "generatedAt": "…"
}
```

Dynamic, uncached, tiny, called once per cold start with a short timeout and
a **safe default baked into the app**: if it cannot be reached, assume
`razorpay: false` and offer Cash on Delivery. That is the same direction the
web degrades in, and it means a bootstrap outage costs online payment, not
the ability to order.

`minClientBuild` is the lever that makes Phase 6's release story work: when
a server change makes an old app version wrong, the server can say so and
the app can show a plain "this version is out of date, please update"
screen. Without it, the only remedy for a bad client is to wait for people
to update on their own, which they do not.

It must never be used to force an update for a reason that is not a
correctness one. A minimum-version wall is a serious thing to point at a
customer holding a phone.

---

## 6. Versioning, and the client header

Everything new is under `/api/v1/` or `/catalog/…-v1.json`. Existing routes
are **not** renamed — `/api/checkout` stays where it is, because the web
posts to it and moving it for tidiness would be a breaking change to a
working shop for no benefit.

Every native request carries:

```
X-Ekmool-Client: mobile/1.4.0 (android; build 41)
X-Ekmool-Install: <32 hex chars>
```

The first is what makes `minClientBuild` enforceable and what lets a log
line say which client hit a bug. The second is §3.

Neither is a credential and neither is trusted for anything a credential
would be trusted for.

---

## 7. What is *not* being added, and why

| Not added | Why |
|---|---|
| A GraphQL layer | Five products and about a dozen operations. |
| A separate BFF service | A second deployable to keep in sync with the first, breaking the "no separate frontend and backend" property the architecture doc opens with. |
| Push notifications | Phase 6 at the earliest, and only for order status — a shop that pushes marketing to a customer who bought turmeric has confused a receipt for a mailing list. Placing an order is not consent to marketing; `docs/SECURITY.md` says so and the DPDP Act agrees. |
| A cart-sync endpoint | There is no account to sync under. Inventing a device-pairing key is inventing registration. Rule 7. |
| `/api/products` | The catalogue document. §1. |

---

## 8. Testing

A new suite, `apps/web/scripts/test-mobile-api.mjs`, in the house style: a
plain script, `PASS`/`FAIL` lines, non-zero exit, cleaning up its own rows.
Wire it as `pnpm --filter web test:mobile-api` and add it to CI's sequential
list and to the table in `docs/CONTRIBUTING.md`.

Assertions that would fail against a naive implementation — which is the
only kind worth writing:

- `/catalog/v1.json` returns 200 **with MySQL stopped**. This is the whole
  phase in one assertion, and it belongs in `test:db-down` as well as here.
- An unchanged catalogue answers `304` to a matching `If-None-Match`.
- `revalidateTag(PRODUCTS_TAG)` changes the ETag; `revalidateReviews()` does
  **not**. The second half is the one that catches a combined document.
- A wrong reference and a wrong email produce byte-identical responses from
  `/api/v1/session`.
- A bearer token from `/api/v1/session` reads the same order as the cookie
  does, and a token signed with a different secret reads nothing.
- A bearer token cannot read an order belonging to another email — session
  scoping, asserted from the new door as well as the old.
- Two install ids from one IP both get through the lookup limiter; one
  install id repeating does not.
- `/api/v1/bootstrap` reports `razorpay: false` when the key is removed.
- No new endpoint returns a `Set-Cookie` for a native client, and
  `/api/v1/session` never reads one.

And the existing suites must stay green untouched — particularly
`test:consent`, which covers security headers and enumeration resistance,
and `chaos`, which now has one more static surface to keep alive.

---

## Exit criteria

- [ ] `test:mobile-api` green, and in CI
- [ ] `test:db-down` extended to cover the three catalogue documents, green
      from a warm cache
- [ ] `chaos` green with the catalogue documents in the traffic mix
- [ ] Every existing suite green, unchanged
- [ ] `pnpm --filter web run audit` unmoved — no new endpoint may add a byte to
      any browsing page
- [ ] Every new endpoint works with **every** third-party key removed
- [ ] `docs/ARCHITECTURE.md` rendering table extended with the three
      catalogue documents, in row one
- [ ] `docs/SECURITY.md` updated: bearer sessions, the install-id limiter
      and its stated limits, and the honest note that Turnstile does not
      cover the app
- [ ] `docs/CONTRIBUTING.md` suite table updated
- [ ] `.env.example` updated if any variable was added

---

## Related

[Programme index](README.md) · [← Phase 1](phase-1-shared-packages.md) ·
[Phase 3 →](phase-3-app-foundation.md) ·
[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) ·
[`docs/SECURITY.md`](../SECURITY.md)
