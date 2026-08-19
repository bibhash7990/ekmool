# Pending

Everything known to be outstanding, as of the website-rebuild kickoff
(after Phase 4, `ca767eb`). Nothing here is a guess — each item is something
that was deliberately deferred, could not be run on this machine, or was
flagged during the work and left alone on purpose.

Ordered by what costs most if it is forgotten.

---

## 0. The mobile app is ON HOLD — owner instruction, 2026-08-19

The programme pivoted to a full website rebuild (giva.co-style structure,
4-category catalog) before any further mobile work. Everything in §3/§3b
below stands, plus three items recorded at the moment of the hold:

- **The launcher icon bakes the wordmark into the square.**
  `apps/mobile/assets/icon.png` contains the full "EKMOOL · SINGLE ORIGIN ·
  INDIA" lockup, so the name renders inside the icon on the home screen —
  illegible at icon size, and Android prints the app name below the icon
  anyway. Fix on resume: regenerate `icon.png`, `adaptive-icon.png` and
  `splash-icon.png` from the roundel mark alone (the circle-and-taproot,
  no text). The owner has an APK installed from the pre-hold build.
- **The app UI will be reskinned after the new web design lands.** The
  Phase 3 app deliberately mirrors the current website; the owner does not
  like that look. Do not resume Phase 5/6 on the old design.
- **Catalog document v1 was widened during the rebuild** (fields added:
  `category`, `subcategory`; types widened: `giTagName` and
  `packSizeGrams` become nullable). Additive per
  `packages/contracts/src/documents.ts`, so no v2 — but the app must
  null-guard `giTagName`/`packSizeGrams` before revival. Typecheck-level
  guards were added during the rebuild; screens showing GI chips or gram
  counts need a design pass for null.

**Status:** on hold until the owner says otherwise.

---

## 1. Rotate the Upstash Redis token — do this first

The full connection URL for the `secure-wildcat-97130` Upstash database,
password included, was pasted into a chat transcript. Transcripts are stored
and are not a secret store.

`docs/SECURITY.md`: **a leaked key is rotated at the provider, not renamed.**

- Upstash console → the `secure-wildcat-97130` database → reset the password
- Update `REDIS_URL` in Vercel (Production, Preview and Development)
- Redeploy, then confirm `/api/health` reports `"rateLimiter":"redis"`

Nothing breaks while it is unrotated — this is not an incident, it is
hygiene. But the window stays open until it is done.

**Status:** open.

---

## 2. Confirm the Vercel cron jobs are still listed

The monorepo move set Vercel's Root Directory to `apps/web`, and Vercel
reads `vercel.json` **from the Root Directory, not the repository root**.
The file was moved to `apps/web/vercel.json` for exactly this reason, but
the consequence of getting it wrong is silent: the scheduled jobs simply
stop, and nothing anywhere reports it.

- Vercel dashboard → the project → Settings → Cron Jobs
- Expect exactly three, matching `apps/web/vercel.json`:
  `abandoned-payment-reminder` (02:00 UTC), `low-stock-report` (02:30 UTC),
  `cancel-stale-orders` (03:00 UTC)
- If the list is empty, `apps/web/vercel.json` is not being read

Worth a two-minute check because the failure mode is silence, and the first
symptom would be a customer not receiving a reminder.

**Status:** open, never verified since the move.

### 2a. `final-notice` never runs on Vercel — decide whether that is right

`scripts/cron-runner.mts` schedules **five** jobs; `apps/web/vercel.json`
declares **three**. Two are missing on Vercel:

| Job | Self-hosted | Vercel | Reading |
|---|---|---|---|
| `abandoned-payment-reminder` | hourly | daily 02:00 UTC | a deliberate downgrade, probably for plan limits |
| `final-notice` | hourly :30 | **absent** | on Vercel, the last-chance email before an order is released **never sends** |
| `backup-upload` | daily 04:00 IST | absent | correct — there is no local disk to upload from |

The `final-notice` gap is the one that touches a customer. It may well be a
deliberate trade against Vercel's cron limits, but that is not written down
anywhere, so it currently reads as an oversight. Either add it to
`vercel.json` or record why it is not there.

Checked and **not** a problem, so nobody re-opens it: every job route
exports `GET = POST`, so Vercel Cron's plain GET is handled, and
`authorizeJob` accepts the `Authorization: Bearer` form Vercel sends as well
as the `x-cron-secret` header the compose scheduler uses.

**Status:** open, needs a decision rather than a fix.

---

## 3. Verification that has never been run

| What | Why it has not run | What it would prove |
|---|---|---|
| `pnpm --filter web chaos` | needs `k6` installed | MySQL pulled out from under **live traffic** — a harder test than `test:db-down`. Now carries the three catalogue documents in its mix, so it would catch a document that is only accidentally static |
| Lighthouse **performance** score | laptop noise makes it meaningless here — two runs of one identical build gave TBT 820 ms and 310 ms on `/`, with the worst page swapping | Whether the score is genuinely where it should be. **Read it off CI's `budget` job**, which measures on consistent hardware |
| The native checkout ceiling (3 orders/hour/install, 10/hour/IP) | asserting it costs four real orders and a twenty-minute refill before the suite can run again | That the volume ceiling a native client pays for skipping Turnstile is actually enforced. The code path is exercised by `test:mobile-api`; only the ceiling itself is unasserted |

Both **`test:db-down` and the Docker image have now been run** — see the
Docker section below, and 27/27 with MySQL stopped including the three
catalogue documents. Those were the two that mattered most.

---

## 3a. The mobile app — what Phase 3 left for Phase 5

**A 962 KB font nobody chose.** `expo export --platform android` bundles
`@expo-google-fonts/material-symbols`, pulled in by `expo-symbols`, which is
a dependency of `expo-router` itself. It arrives regardless of which icons
the tab bar names, and against a 4.7 MB Hermes bundle it is the single
largest asset in the app. Phase 5's whole subject is size; this is its first
target. Measure whether it can be excluded before assuming it can.

**Recorded numbers, so Phase 5 has a baseline rather than an adjective:**

| | |
|---|---|
| Hermes bundle (android, release export) | 4.7 MB |
| Assets | 27, of which one is 962 KB |
| Modules in the graph | 1815 |
| Embedded fonts (ours) | 4 files, 154 KB |

These are export figures, **not** an installed app size. The APK/AAB numbers
in `research/mobile-stack-research.md` §4 are the ones that matter to a
customer, and they need the §8 build to produce.

**`eslint-config-expo` is not installed.** Mobile lints with `eslint` +
`typescript-eslint`, both already in the tree for the web, so nothing new
entered the repository (rule 12). Expo's own config would add React Native
specific rules — hooks dependency arrays, platform-file consistency — and is
worth asking for if those turn out to matter.

**Reviews are not read by the app at all.** `reviews-v1.json` ships and
nothing consumes it. Rendering a rating means first answering what an
unreviewed product shows, and rule 5 makes that a real question rather than
a styling one.

**The cart shows a subtotal, not a total.** `FREE_SHIPPING_THRESHOLD_PAISE`
and `FLAT_SHIPPING_PAISE` live in `apps/web/src/lib/constants.ts`, not in a
shared package, and coupon value comes from the quote endpoint. Copying
₹499/₹49 into the app would re-implement arithmetic that Phase 1 exists to
keep in one place. **If those constants move into `@ekmool/core`, the cart
screen should grow a real total.**

---

## 3b. Phase 4 — what the commerce flows left open

The app can sell: cart, guest checkout, Cash on Delivery, orders, the account
area, wishlist and reviews. **None of it has been run against a server or a
device**, and the phase's own exit criteria are mostly verification.

### Needs a decision from the owner

- **Online payment is deferred.** COD only, by decision, because the plan
  says the UPI round trip is what "decides whether D4 stands" and that needs
  the same physical hardware the launch gate is waiting on. `react-native-
  razorpay` was checked and is **not** abandoned (3.0.0, published within the
  month), so this is a scheduling choice, not a forced one.
- **Data export goes through React Native's `Share`.** `/api/account/export`
  needs the bearer token, which a Custom Tab does not carry, and there is no
  `expo-file-system`. It satisfies DPDP s.11 — the person gets their data in
  a keepable form — but a long history makes a long share message and some
  targets truncate. `expo-file-system` is the request if that bites; it needs
  approval (rule 12) and a size that caused it.
- **`CHALLENGE_FAILED` says "Please reload and try again"** — browser wording
  a phone customer cannot act on. It is reachable natively, via the hourly
  ceiling or a keystore failure. `docs/SECURITY.md` requires every refusal be
  byte-identical **across causes**, which does not forbid making the sentence
  device-neutral for every client at once. A web copy change.
- **Addresses are create-only from the app.** `POST /api/account/addresses`
  validates with bare `savedAddressSchema`, which strips an unknown `id`, so
  an "edit" would silently create a duplicate. Edit and set-default were
  written against the assumed contract and **removed** on reading the real
  one. Whether the phone should manage addresses is a product question.

### Duplication that should move into `@ekmool/core`

- `RETURN_REASONS` lives in `apps/web/src/db/queries/returns.ts`, which
  imports `server-only` and `mysql2`, so the app cannot reach it and carries
  a copy. `PAYMENT_STATUS_LABEL` is the same story. Both belong beside
  `order-status.ts`, which was moved for exactly this reason. The drift is
  bounded — the server's `z.enum` refuses a stale value — but bounded drift
  is still drift.

### Known-wrong, deliberately not fixed in this phase

- **The double gutter.** `Screen` applies `paddingHorizontal: 20` and most
  screens add another 20 inside their scroll content, so the app renders 40
  where the design system says 20. Fixing it properly is a change to `Screen`
  and every caller, and doing it screen-by-screen would leave the app
  visibly inconsistent mid-way.
- **A `Field` component is duplicated** in `sign-in.tsx` and
  `account/addresses.tsx`. Two copies is the point at which it becomes
  `ui/Field.tsx`.
- **The web's order status copy is now the one that is wrong.** The app says
  "Waiting for your payment" / "Waiting to be sent" / "On its way to you";
  `apps/web` prints "On its way to you." for everything not delivered or
  cancelled, including an order still sitting in the workshop.

### Verification that has not run

`test:mobile-api` gained a section for the new account endpoints and **has
never executed** — Docker Desktop was stopped when the work finished, and the
running image predated the new routes in any case. Rebuild the stack before
trusting any of it.

The device half of Phase 4 — a COD order from a Release build appearing in
`/admin`, TalkBack over add-to-cart → checkout → receipt, the checkout form
at 200% text scale — shares hardware with the Phase 3 launch gate and should
be run in the same sitting. `docs/mobile/device-checklist.md` is an exit
criterion and **is not written yet**.

---

## 4. Deliberate gaps, written down so they are not rediscovered as bugs

**The 304 needs an edge in front of it.** `/catalog/*.json` publish an ETag,
but a bare `next start` answers 200 with the full body every time. Under
`force-static` Next hands the route an empty headers stub, so
`If-None-Match` cannot be read in the handler — and dropping `force-static`
to fix that would move the documents out of row one of the rendering table
and make the app the first thing to fail in a database outage. Vercel's CDN
and the `--profile edge` nginx both do the conditional. A plain Node origin
does not. Full account in `apps/web/src/lib/catalog-document.ts`.

**Play Integrity / App Attest are not attempted.** They are the correct
long-term answer to native abuse, and each is a config plugin, a server
verification path, a key to manage and a new documented inert state for when
that key is absent. Its own milestone. Until then the native checkout trade
is the priced one in `docs/SECURITY.md`: skip the challenge, accept 3
orders/hour per install and 10/hour per IP.

**Push notifications** are Phase 6 at the earliest, and only for order
status. Placing an order is not consent to marketing — `docs/SECURITY.md`
says so and the DPDP Act agrees.

**`minClientBuild` has no client half yet.** The server can say "this build
is too old"; nothing reads it. That is Phase 3's job, and until it exists
the field is inert rather than wrong.

---

## 5. Small things

- **The repository-root `.env.local` is the pre-monorepo location.**
  `apps/web/scripts/load-env.mts` reads it as a fallback and its comment
  says to drop those two lines once no checkout has one. This checkout still
  has one, and both files are currently kept in sync by hand — which is
  exactly the drift the comment is worried about. Delete the root copy once
  nothing depends on it.
- `research/audits/lh-product-m2.json` is a stale artifact from an older
  milestone, sitting beside the current run's four reports. Harmless, but it
  will confuse whoever reads the directory next.
- `docs/mobile/phase-4-commerce-flows.md` onwards are plans rather than
  descriptions. Phases 4–6 are untouched.

---

## The Docker stack — run, and what it found

`docker compose up -d --build` now brings up all seven services: MySQL,
Redis, a one-shot migrate, a one-shot builder, the app, the cron scheduler
and the backup scheduler. The site is on **http://localhost:3000**.

It did not work on the first attempt, and the reason is worth keeping:

**The `deps` stage copied no `packages/*/package.json`.** Its own comment
said "`packages/` is empty in Phase 0 — the first package added there needs
a COPY line of its own here", and Phase 1 added three without adding the
line. `pnpm install --frozen-lockfile` resolves the whole workspace graph in
one pass and fails when a member the lockfile knows about is not on disk.
Fixed by copying the manifests in `deps` and the whole `/app/packages`
directory into both build stages — one line rather than one per package, so
a fourth package needs no edit. The same copy had to be added to
`standalone-builder`, which is a second independent path to the same build
and fails only on whichever of compose and Render nobody ran last.

What the run proved that the host build could not:

- The **two-`node_modules`-tree copy** works: pnpm's isolated linker leaves
  relative symlinks, and they survive the copy because every tree lands at
  the path it occupied in `deps`.
- The `apps/web/.next/standalone` COPY path is right — the app serves.
- `{"ok":true,"db":"up","redis":"up","rateLimiter":"redis"}`: the shared
  limiter, not the per-process fallback.
- The **reviews and content ETags are byte-identical to the host build**
  (`7e0d8329…`, `958a4200…`) across two independent builds on two machines.
  That is the content hash being genuinely deterministic rather than
  coincidentally stable.
- `test:mobile-api` **52/52**, including one assertion the keyless run
  cannot make: with Turnstile actually configured, a browser with no token
  is refused where the native client is not. Against a keyless server that
  branch is dead code that passes.

**The suites assume a keyless server, and that was hidden until now.**
`test:mobile-api` placed its orders as a browser, so it failed
`CHALLENGE_FAILED` against a fully-configured local stack while passing in
CI. It now places them as a phone, which is both what the suite is for and
what makes it run in either environment. Worth checking whether any other
suite has the same shape.

---

## Not pending

Recorded here so nobody re-opens them:

- **Phases 0, 1 and 2 are complete and pushed.** Monorepo, shared packages,
  and the mobile API surface.
- **`test:db-down` is green** with the catalogue documents included.
- **The script budget is not a concern.** Phase 2 was measured against a
  Phase 1 build: 52 chunk files both sides, 2,181,512 → 2,181,704 bytes.
  192 bytes across the entire client bundle, and no Phase 2 string appears
  in it at all.
- **The `unstable_cache` date bug is fixed.** A cache hit returned
  `Review.createdAt` as a string while the type said `Date`; the dates are
  now revived outside the cache in `apps/web/src/db/queries/reviews.ts`.
- **Vercel Cron's GET is handled.** Every `/api/jobs/*` route exports
  `GET = POST`, and `authorizeJob` accepts `Authorization: Bearer` as well
  as `x-cron-secret`. Checked against the running stack: both verbs answer
  200. This looked like a live bug and is not one.
- **The Docker image builds and runs.** See above.
