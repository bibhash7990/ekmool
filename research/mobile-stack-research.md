# EKMOOL — Mobile Stack Research

Date: **2026-08-09** · Every version below was read from the live npm registry
or current official documentation on that date, not from memory. Where a
claim came from a blog post rather than a primary source it says so.

Environment verified: Windows 11 · Node **v22.22.3** · npm 10.9.8 ·
pnpm **11.5.1** (already installed) · repo on `main` at `bbb810d`.

Purpose: establish the facts the phase plans in [`docs/mobile/`](../docs/mobile/README.md)
depend on. Nothing here is a plan. Everything here is either a measured
number, a pinned version, or a documented constraint with its source.

---

## 0. What already exists, and what that means for a phone

The web application is not a typical Next.js shop, and three of its
properties decide most of the mobile architecture before any React Native is
written.

| Existing property | Consequence for the app |
|---|---|
| **Browsing never touches MySQL** (`docs/ARCHITECTURE.md`) — `/`, `/products`, `/products/[slug]`, `/blog/*` and the policy pages are static, revalidated by tag | The app must not get its catalogue from a database-backed endpoint, or it silently becomes the first client that goes down when MySQL does. It needs a **statically generated catalogue document**, tag-purged like every other browse surface. |
| **There is no registration, and there must never be one** (rule 7) — a customer's identity is an HMAC-signed cookie issued by `/api/account/lookup` after they quote an order reference plus the email they ordered with | The app has no sign-up screen and no password field. It has the same `/track` door. But a native client cannot rely on a `Set-Cookie` the way a browser does, so the session needs a **bearer form of the same token** — the same HMAC, carried in a header instead of a cookie. |
| **Every third-party key is optional** and its absence has a documented inert state | The same contract has to hold on the phone: no Razorpay key → the app offers Cash on Delivery only and does not render a broken button; no object storage → image paths; no SMTP → nothing visible changes. A build that crashes without a key fails the project's oldest rule. |

Two more that shape smaller decisions:

- **Money is integer paise** and rupees are converted in exactly one place.
  That one place is `src/lib/money.ts`, which is 23 lines, imports nothing,
  and is already portable. It is the first thing that should move into a
  shared package.
- **`src/proxy.ts` rate-limits `/api/*` by forwarded IP.** A mobile client
  on a carrier NAT shares an IP with a great many other people. The 5/min
  bucket on `/api/account/lookup` is deliberately strict and will produce
  false 429s for app users on the same mobile network. This is a real
  problem and Phase 2 has to solve it deliberately, not discover it in
  production.

### What the app can reuse as-is

Read at first hand, these route handlers already return clean JSON with
stable `code` fields and are usable from a phone with no change to their
bodies:

| Endpoint | Notes |
|---|---|
| `POST /api/checkout` | Requires an `Idempotency-Key` header ≥ 8 chars. Returns `orderId`, `status`, `totalPaise`, `razorpayOrderId`, `razorpayKeyId`. Replay returns 200 with `replayed: true`. Refusals are typed: `INSUFFICIENT_STOCK`, `COUPON_REFUSED`, `UNKNOWN_VARIANT`, `DB_UNAVAILABLE`. This is already a better API than most shops expose deliberately. |
| `POST /api/coupons/preview` | Coupon arithmetic without committing. |
| `GET /api/serviceability` | PIN → zone and delivery band. |
| `POST /api/back-in-stock`, `POST /api/newsletter/subscribe`, `POST /api/reviews` | Write paths, Zod-validated. |
| `GET /api/orders/[id]`, `…/cancel`, `…/return`, `…/reorder` | Session-scoped. Needs the bearer session from Phase 2. |
| `GET/POST /api/account/*` | Same. |

### What does not exist yet and must be built

- **A catalogue document.** There is no `/api/products`. The catalogue
  reaches the browser only as prerendered HTML. On purpose.
- **Bearer sessions.** `src/lib/session.ts` signs and verifies a token
  already; only the transport is cookie-shaped.
- **A reviews read endpoint.** Reviews reach the page through
  `getRecentReviews`, server-side.
- **Anything for Turnstile on a native client.** `verifyChallenge` runs on
  `/api/checkout` and `/api/account/lookup`. There is no Turnstile widget on
  a phone. Phase 2 has to decide what the app sends instead, and "nothing"
  is not an answer that keeps the honeypot's job done.

---

## 1. Pinned versions — read from the registry on 2026-08-09

```
expo                             57.0.11
expo-router                      57.0.11
react-native                     0.86.2
react                            19.2.3   (the version SDK 57 pins)
react-native-screens             4.27.0
react-native-safe-area-context   5.8.1
react-native-gesture-handler     3.1.0
react-native-reanimated          4.5.3
react-native-worklets            0.11.3
@shopify/flash-list              2.3.2
expo-image                       57.0.2
expo-updates                     57.0.12
expo-dev-client                  57.0.10
expo-secure-store                57.0.1
expo-notifications               57.0.9
expo-web-browser                 57.0.2
react-native-razorpay            3.0.0    (published 2026-07-21 — maintained)
@sentry/react-native             8.22.0
posthog-react-native             4.62.0
turbo                            2.10.9
eas-cli                          21.7.0
expo-atlas                       0.4.3
```

**Expo SDK packages are now version-aligned with the SDK.** `expo-router`
is `57.0.11`, not `v7.x`. Anything written before SDK 55 that talks about
"expo-router v6" is describing the same package under the old numbering.

### Platform floors for SDK 57

From the SDK 57 reference (`docs.expo.dev/versions/v57.0.0`):

| | Requirement |
|---|---|
| React Native | 0.86 |
| React | 19.2.3 |
| Node | **22.13.x minimum** — local Node is 22.22.3, CI pins `"22"`. Both fine. |
| Android | OS 7+, `compileSdkVersion` 36, `targetSdkVersion` 36 |
| iOS | **16.4+**, Xcode **26.4+** |

The Xcode floor matters: iOS release builds must be produced on EAS Build's
macOS images (or a Mac with Xcode 26.4). There is no Mac in this
environment, which is not a blocker — EAS builds iOS in the cloud — but it
does mean **no iOS binary can be tested locally**, and Phase 6 has to plan
around that with TestFlight rather than around a simulator.

### React version skew between the two apps

The web app pins `react@19.2.8`; SDK 57 pins `19.2.3`. **This is not a
problem, and it must not be made into one.** pnpm's isolated node_modules
gives each app its own React. The rule that follows is a hard one:

> **No shared package may import React.** Shared code is types, arithmetic,
> Zod schemas and constants. The moment a package renders, the monorepo
> acquires a single-React-version constraint it does not need, and Expo's
> own monorepo guide names duplicate React as the top cause of
> "Invalid hook call" in exactly this setup.

---

## 2. SDK 56 versus SDK 57 — and the bug that decides the navigation shape

Expo ships roughly three SDKs a year, each targeting one React Native
version.

| | SDK 56 | SDK 57 |
|---|---|---|
| Released | 2026-05-21 | current (57.0.11) |
| React Native | 0.85 | 0.86 |
| React | 19.2 | 19.2 |
| Notes | Hermes **V1** becomes the default engine. Precompiled iOS packages cut median build time ~16%. **expo-router stops being a wrapper over React Navigation** — most direct `@react-navigation/*` imports no longer work; a codemod is provided. On-demand filesystem removes the need for `watchFolders`, which is what makes pnpm's virtual store work without hoisting. EAS Update bundles ~58% smaller via Hermes bytecode diffing. | RN 0.86, described upstream as **no breaking changes from 0.85**. Edge-to-edge fixes on Android, `expo-image` cache seeding, `Stack.Toolbar.Badge` in more placements, reanimated 4.5 / worklets 0.10 / gesture-handler 2.32. |

Legacy architecture was **removed entirely in SDK 55** (February 2026) —
not deprecated, removed. `newArchEnabled: false` is silently ignored. Every
native dependency chosen must be New-Architecture-native; there is no
interop escape hatch to fall back to.

### The open SDK 57 defect that changes the plan

`expo/expo#47687`, open and accepted at the time of writing:

> iOS **Release** builds hang forever on the native splash screen when
> expo-router uses a `Tabs` layout where **each tab hosts its own nested
> `Stack`**. Debug builds never reproduce it. The navigator's first Fabric
> commit never completes. Affected: expo-router 57.0.4, RN 0.86.0, New
> Architecture, Hermes. Cross-filed upstream as `react-native#57511`.
>
> Workaround, reported as 0/10 → 10/10 successful launches: **flatten the
> tab structure.** Tab screens sit flat, the `Tabs` component owns the
> headers, and detail screens push onto the **root** stack.

Two things follow, and the second is the useful one:

1. The stated requirement is "deploy in one go without any error". A known
   open Release-only hang on iOS is exactly the class of defect that turns a
   first submission into a rejected build, because it is invisible in
   development.
2. **The workaround is the architecture we want anyway.** One root native
   stack with flat tabs is fewer native containers, fewer screens kept
   mounted, and a cheaper cold start than seven stacks in a trench coat. The
   defect is not forcing a compromise; it is forcing the faster design.

The other known SDK 57 note, from the changelog itself: **Hermes V1 with
react-native-reanimated raises memory use 25–30%**, with a worklets
bundle-mode workaround. Hermes V1 is the default from SDK 56, so this is not
avoided by staying on 56. It argues for using reanimated sparingly — which
the design system already does: "150–300ms, colour and opacity only".

---

## 3. Monorepo: pnpm + Turborepo with Expo

Read from `docs.expo.dev/guides/monorepos` on 2026-08-09.

- **No Metro configuration is needed for SDK 52+.** `expo/metro-config`
  detects the monorepo. If a `metro.config.js` carries `watchFolders`,
  `resolver.nodeModulesPath`, `resolver.extraNodeModules` or
  `resolver.disableHierarchicalLookup`, those must be **deleted** — they are
  now actively wrong. Older tutorials all tell you to add them.
- **pnpm's default isolated linker is supported natively from SDK 54.**
  `nodeLinker: hoisted` in `pnpm-workspace.yaml` is the escape hatch, not
  the starting point. SDK 56's on-demand filesystem is what made the virtual
  store work.
- Autolinking module resolution is automatic from SDK 55.
- Duplicate React Native versions in one monorepo are **not supported**.
  There will be exactly one.
- Native build files must resolve Node paths dynamically, never hardcode
  them. Relevant only if we ever run `expo prebuild` and commit the output —
  see §6 on why we will not.

Turborepo 2.10.9 is the current line. Its job here is small and worth being
honest about: the repo has two apps and three tiny packages. Turbo earns its
place for **task graph + caching** (`typecheck` and `lint` across five
workspaces, cached), not for anything exotic.

### The risk that is not about tooling

The web app's deployment surface hardcodes the repo root in four places:

| File | What breaks when `src/` moves to `apps/web/src/` |
|---|---|
| `Dockerfile` | `COPY package.json package-lock.json ./`, `RUN npm ci`, `COPY . .`, and the standalone copy paths at lines 144–146 |
| `.github/workflows/ci.yml` | `cache: npm`, `npm ci`, and ~20 `npm run test:*` invocations across three jobs |
| `vercel.json` | Cron paths are fine; the project's root directory setting in the Vercel dashboard is not in the repo and must be changed by hand |
| `render.yaml` | Build and start commands, and the Docker context |

Plus `tsconfig.json` (`paths: { "@/*": ["./src/*"] }`), `next.config.ts`,
`postcss.config.mjs`, `eslint.config.mjs`, `instrumentation*.ts`,
`sentry.*.config.ts`, `mdx-components.tsx` and every `scripts/*.mjs` that
resolves a path relative to `process.cwd()`.

This is the single largest source of "it deployed with an error" in the whole
programme, and it is entirely in Phase 0, before a line of React Native
exists. That ordering is deliberate.

---

## 4. App size — the numbers, and where they come from

From `docs.expo.dev/distribution/app-size`, for a React Native 0.73+ app:

| Artefact | Size |
|---|---|
| Android APK (release, universal) | **62.1 MB** |
| Android App Bundle (`.aab`) | **27.4 MB** |
| **Google Play download** | **11.7 MB** |
| iOS, blank template, App Store download | **just under 4 MB** |

The number that matters is the third one. **Play downloads a
device-specific split from the AAB**, so the 62 MB universal APK is never
what a customer receives. Any comparison that quotes APK size is measuring
something no user experiences. This has to be said explicitly in the plan,
because "the APK is 60 MB" is the most common way this requirement gets
mis-tracked.

Levers, with what each is actually worth:

| Lever | Effect | Cost / caveat |
|---|---|---|
| Ship an **AAB**, never a universal APK | The whole 27.4 → 11.7 MB gap | None. This is default for EAS `production`. |
| **Hermes** bytecode | JS bundle 30–50% smaller than JSC, and faster startup | Default and mandatory. Not a decision. |
| **R8** (`minifyEnabled`) | Cited at 30–50% off compiled Java/Kotlin | Already on in EAS production builds. `android.enableR8.fullMode=true` is the more aggressive tier; it can break reflection-based libraries, so it is a measured experiment, not a default. |
| `shrinkResources` | Drops unreferenced Android resources | Enable with R8, via `expo-build-properties`. |
| `useLegacyPackaging: true` | Re-compresses native libs; RN 0.73+ stores them uncompressed for faster load | **Shrinks the file, slows first launch.** A trade, not a win. Measure both. |
| Fewer native dependencies | The largest single lever available to us | Each native module is compiled code in every split. This is where the app either stays small or does not. |
| Font subsetting | Marcellus + Figtree, Latin + the ₹ glyph only | The web already self-hosts both; the same subsets can be reused. |
| No bundled photography | The design system says there is no stock photography and images come from object storage | Already true. Nothing to fix, everything to preserve. |

**Expo Atlas** (`expo-atlas@0.4.3`) is the measurement tool:
`EXPO_ATLAS=true npx expo export`, then inspect. It visualises the JS bundle
per module. It does **not** measure native size — that is APK Analyzer on
Android, and for iOS, unzipping the `.ipa` and reading `Assets.car` with
`assetutil`, which needs a Mac. Practically: **iOS size will be tracked from
App Store Connect / TestFlight's own estimate**, not measured locally.

---

## 5. Payments on the phone

Two viable routes. Both preserve the graceful-degradation contract; they
differ in binary size and in how UPI behaves.

**A. `react-native-razorpay@3.0.0`** — the official wrapper over Razorpay's
native Android and iOS SDKs. Published 2026-07-21, so it is maintained. It
needs a native build, which is not a constraint here because Expo Go is not
part of this plan anyway. Cost: the native SDK is compiled into every split,
whether or not a Razorpay key exists at runtime. Benefit: native UPI intent
handoff, which is how essentially every Indian customer on Android pays, and
a return path the OS manages.

**B. Razorpay Standard Checkout in `expo-web-browser`** — the hosted
checkout in a Custom Tab (Android) or `SFSafariViewController` (iOS). Adds
no native payment SDK, so roughly zero MB. The risk is the UPI round trip:
the browser hands off to a UPI app and something has to bring the customer
back to a definite result. The webhook already makes the *server* correct
regardless — `orders.razorpay_payment_id` is uniquely indexed and the
signature is checked before the body is parsed — so the exposure is a
confused customer, not a lost payment.

The honest position: **A is the right default for this audience**, and B is
the fallback if A's measured size is unacceptable. That measurement belongs
in Phase 5, and the decision should be recorded there with the number.

One thing that must be written down either way: on the web, `hasRazorpay`
makes the option invisible when no key is configured. On a phone, the native
SDK is in the binary regardless. **The capability flag controls the UI, not
the bytes.** Pretending otherwise in a comment would be a lie of exactly the
kind this codebase is careful about.

---

## 6. Build and release mechanics

**EAS Build, no committed `android/` or `ios/` directories.** Continuous
Native Generation — prebuild runs on the build machine from `app.config.js`
and config plugins. Committing the native projects means every SDK upgrade
becomes a three-way merge of Gradle files. The one reason to commit them is
native code that no config plugin can express, and there is none here.

**Versioning.** From `docs.expo.dev/build-reference/app-versions`:

- `cli.appVersionSource` is either `local` (the repo is the truth) or
  `remote` (EAS is the truth, with `autoIncrement`).
- `autoIncrement` is **not supported** with
  `runtimeVersion: { policy: "nativeVersion" }`.
- The `appVersion` policy bumps the runtime version whenever the app version
  bumps — and if you forget to bump the app version after a native change,
  you ship an OTA update into a binary that cannot run it.

That last sentence is the whole risk of EAS Update in one line. The
resolution belongs in Phase 6, but the shape is: **`appVersionSource:
local`, so the version lives in the repo next to the change that caused it,
reviewed in the diff** — consistent with a project whose commit messages are
its history of why.

**EAS Update** is worth taking: SDK 56's Hermes bytecode diffing cut update
payloads ~58%, and the ability to fix a copy error without a store review is
the difference between a shop that reads well and one that waits four days.
It is not a way to ship native changes, and the plan must say so where
someone will read it.

---

## 7. Dependency budget

Rule 12 says ask before adding a dependency, and the project has taken
exactly one since v1.0.0. A React Native app cannot be built at that
standard literally — `expo` alone brings a tree. What can hold is the
standard applied to **choices that are actually choices**: everything in the
Expo SDK is one decision (take the SDK), and everything outside it is its
own.

Proposed, with what each replaces:

| Package | Why not forty lines of ours |
|---|---|
| `expo` + `expo-router` + the SDK modules | The decision. Bare RN means owning the upgrade path, the build pipeline and the OTA channel by hand. |
| `react-native-screens`, `-safe-area-context`, `-gesture-handler`, `-reanimated`, `-worklets` | Peer requirements of expo-router. Not separate decisions. |
| `@shopify/flash-list@2.3.2` | Recycling list. With five products it earns nothing on the catalogue — but the orders list and the reviews list are unbounded. Take it only where a list can grow; `FlatList` elsewhere. |
| `react-native-razorpay` | §5. Conditional on the Phase 5 measurement. |
| `@reduxjs/toolkit` + `react-redux` | **Already approved** for the web. Reusing the cart slice means one cart implementation across two clients rather than two that drift. This is a re-use, not an addition. |

Deliberately **not** taken, so it does not get re-litigated:

| Not taken | Instead | Why |
|---|---|---|
| **NativeWind** | A typed token module generated from the same source as the CSS `@theme` | The design system is 11 colours and 7 type sizes. NativeWind adds a Babel transform and a runtime style resolver to save writing `StyleSheet.create`. The project's own record — a hand-written 250-line service worker over Workbox, a 12-line CSV writer over a library — says which way this goes. The ergonomic loss is real and is the price. |
| **TanStack Query** (initially) | A ~80-line cached-resource hook over `expo-sqlite/kv-store` | The catalogue is *one* document. Most other reads are one screen each. Revisit if Phase 4 ends with more than eight distinct server resources with genuinely different caching needs — and if so, take it and say why in the commit. |
| **`react-native-mmkv`** | `expo-sqlite/kv-store` | v4 needs `react-native-nitro-modules`, a second native dependency, to store a cart. `expo-sqlite/kv-store` is a drop-in AsyncStorage-compatible store with synchronous reads, already inside the SDK. No new native module, no extra bytes. |
| **`@react-navigation/*` directly** | `expo-router` | From SDK 56 direct React Navigation imports largely stop working. Reaching past the router is now a compatibility bug waiting for the next SDK. |
| **A separate BFF service** | Route handlers in the existing Next app | A second deployable to keep in sync with the first, for endpoints the first can serve. It would also break the "one process" property the architecture doc opens with. |

---

## 8. Open risks, ranked

1. **The monorepo move breaks a deploy path that is only exercised in
   production.** Highest-probability failure in the programme. Mitigated by
   doing it first, alone, with every existing gate green before and after.
2. **`expo/expo#47687`** — iOS Release-only splash hang. Mitigated by the
   flat navigation architecture, and by a Release-build smoke test on real
   hardware as a Phase 3 exit criterion rather than a Phase 6 discovery.
3. **Rate limiting versus carrier NAT.** App users on one mobile network
   share an IP and will collide on the 5/min lookup bucket. Needs a
   deliberate answer in Phase 2.
4. **Turnstile has no native equivalent.** The honeypot and the timing check
   also do not translate. Checkout's abuse story on mobile needs to be
   redesigned, not skipped.
5. **No Mac.** iOS is build-and-test-in-the-cloud only. Every iOS-specific
   defect costs a full EAS build cycle to reproduce.
6. **Two React versions and one Metro.** Held off by the no-React-in-shared-
   packages rule; worth an explicit check in CI.

---

## Sources

- [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57) ·
  [SDK 56 changelog](https://expo.dev/changelog/sdk-56) ·
  [SDK 57 reference](https://docs.expo.dev/versions/v57.0.0.md)
- [Work with monorepos](https://docs.expo.dev/guides/monorepos/)
- [Understanding app size](https://docs.expo.dev/distribution/app-size/) ·
  [Analyzing bundles](https://docs.expo.dev/guides/analyzing-bundles/)
- [App version management](https://docs.expo.dev/build-reference/app-versions/) ·
  [Runtime versions and updates](https://docs.expo.dev/eas-update/runtime-versions/)
- [Native tabs](https://docs.expo.dev/router/advanced/native-tabs/)
- [React Native's New Architecture](https://docs.expo.dev/guides/new-architecture/)
- [expo/expo#47687 — iOS Release builds hang with nested per-tab stacks](https://github.com/expo/expo/issues/47687)
- [expo-sqlite / kv-store](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- [Razorpay React Native Standard SDK](https://razorpay.com/docs/payments/payment-gateway/react-native-integration/standard/)
- npm registry, queried 2026-08-09, for every version in §1
