# Ekmool on a phone — the programme

A native Android and iOS app for the same shop, built inside this repository
as a pnpm + Turborepo monorepo, sharing one set of rules with the web
application and adding none of its own that contradict them.

**Read [`research/mobile-stack-research.md`](../../research/mobile-stack-research.md)
first.** Every version, every size figure and every constraint quoted in
these plans was verified there on 2026-08-09 against the live registry and
current documentation. These plans do not restate the evidence; they act on
it.

---

## What is being built, in one paragraph

The web application stays exactly what it is: one Next.js process, static
browsing, guest checkout, MySQL only where it is unavoidable. It moves to
`apps/web/` and gains a small, deliberate **mobile API surface** — a
statically generated catalogue document and a bearer form of the session it
already signs. A new Expo app in `apps/mobile/` consumes that surface. The
arithmetic that decides money, GST, coupons and delivery bands is lifted
into `packages/core` so there is exactly one implementation of each, used by
both clients. Nothing about the design system, the accessibility floor, the
graceful-degradation contract or the twelve rules is relaxed for the phone.

---

## The seven phases

Each has its own document. Each is independently shippable: the repository
is green, deployable and honest at the end of every one.

| Phase | Document | What it delivers | Web app is… |
|---|---|---|---|
| **0** | [Monorepo conversion](phase-0-monorepo.md) | pnpm workspaces, Turborepo, `apps/web/`, every deploy path repaired | byte-identical in behaviour |
| **1** | [Shared packages](phase-1-shared-packages.md) | `@ekmool/core`, `@ekmool/contracts`, `@ekmool/tokens`; web refactored onto them | unchanged, same script budget |
| **2** | [The mobile API surface](phase-2-mobile-api.md) | Catalogue document, bearer sessions, the reads the app needs, an abuse story that works without Turnstile | gains endpoints, loses nothing |
| **3** | [App foundation](phase-3-app-foundation.md) | Expo app, navigation, theming from tokens, data layer, cart, a Release build that launches on real hardware | untouched |
| **4** | [Commerce flows](phase-4-commerce-flows.md) | Catalogue, product, cart, checkout, payment, orders, account, wishlist, reviews | untouched |
| **5** | [Size, performance, accessibility](phase-5-size-and-performance.md) | Measured budgets and the gates that hold them | untouched |
| **6** | [Release engineering](phase-6-release-engineering.md) | Version management, EAS profiles, OTA policy, CI, store submission | CI extended |

Phases 0–2 are server and repository work. Phase 3 is where React Native
starts. **Do not begin Phase 3 before Phase 0 is deployed and observed
healthy in production** — the monorepo move is the riskiest change in the
programme and it must not be entangled with a new app.

---

## Decisions taken, and how to reverse them

Each is argued where it belongs; this is the index. "Reverse if" is the
condition that should make you change your mind, written down before there
is any ego attached to the answer.

D1, D4 and D5 were put to the owner and confirmed on **2026-08-09**. The
rest are engineering defaults and can be argued with at any time.

| # | Decision | Chosen | Rejected | Reverse if |
|---|---|---|---|---|
| **D1** | Expo SDK | **57** (RN 0.86), with a flat navigation graph | 56 (RN 0.85) | The flat-navigation workaround for `expo/expo#47687` fails the Phase 3 Release-build smoke test on iOS hardware. Then pin 56 and revisit at 58. |
| **D2** | Repository layout | Move the web app to **`apps/web/`** | Leave it at the root with `apps/mobile/` beside it | Never — a workspace root that is also a workspace member confuses every tool that reads `package.json`, permanently. |
| **D3** | Package manager | **pnpm** (11.5.1, already installed) | Stay on npm; use Bun | npm workspaces do not give the isolated store that keeps two React versions apart, which is the property doing the work here. |
| **D4** | Payments in the app | **`react-native-razorpay@3.0.0`** (native SDK) | Standard Checkout in `expo-web-browser` | Phase 5 measures its contribution above ~4 MB of Play download, or the Phase 4 UPI round trip proves unreliable. |
| **D5** | Styling | **`StyleSheet` + a typed token module** generated from the same source as the CSS `@theme` | NativeWind | Three or more contributors are writing screens and the ergonomic cost is measurably slowing them. Not before. |
| **D6** | Server-state caching | A **~80-line cached-resource hook** over `expo-sqlite/kv-store` | TanStack Query; `react-native-mmkv` | Phase 4 ends with more than eight distinct server resources with genuinely different caching needs. Then take TanStack Query and put the count in the commit message. |
| **D7** | Cart state | **Reuse the web's Redux Toolkit slice** from `@ekmool/core` | A second, native-only cart | Never. Two cart implementations drift, and the one that drifts is always the one that computes a total. |
| **D8** | Native projects | **Not committed** — Continuous Native Generation via EAS | Commit `android/` and `ios/` | A native change appears that no config plugin can express. There is none today. |
| **D9** | OTA updates | **EAS Update on**, JS-only, `appVersionSource: local` | No OTA; or `remote` with `autoIncrement` | `autoIncrement` is incompatible with the `nativeVersion` runtime policy, and a version that lives in the repo is reviewed in the diff that caused it. |

---

## The rules, restated for a phone

The twelve rules in [`AGENTS.md`](../../AGENTS.md) apply unchanged. Six of
them mean something different on a native client and are spelled out here so
nobody has to infer it.

1. **Money is integer paise** (rule 4). The app never does rupee arithmetic.
   It calls `formatPaise` from `@ekmool/core`, the same function the web
   calls. There is no second `Intl.NumberFormat` anywhere in `apps/mobile/`.
2. **Never fabricate social proof** (rule 5). No placeholder ratings, no
   skeleton stars that imply a review exists, no "12 people are viewing
   this". A product with no reviews shows no rating — not a zero, and not a
   grey five-star row waiting to be filled.
3. **Design tokens only** (rule 6). A hex literal in `apps/mobile/` is a
   review failure exactly as it is in `src/components/`. Tokens come from
   `@ekmool/tokens`; the CSS `@theme` and the React Native object are
   generated from one source, so they cannot drift.
4. **Guest checkout never requires login** (rule 7). The app opens on the
   catalogue. There is no sign-in wall, no "continue as guest" button — that
   phrasing implies an account exists to skip. The order-lookup screen is
   reachable, never imposed.
5. **Browsing never touches the database** (rule 8). The app's catalogue
   comes from a statically generated, tag-purged document. If a phone
   request ever causes a `SELECT` to render a product, the property is gone
   for the app the same way it would be gone for the web.
6. **Accessibility stays at 100** (rule 11). Lighthouse does not run on a
   phone, so the gate becomes explicit: 44×44 minimum touch targets,
   `accessibilityLabel` on every icon-only control, `accessibilityRole` on
   every pressable, 4.5:1 contrast — `gold-800` remains the only gold safe
   as ink — dynamic type honoured up to 200%, and a TalkBack pass over the
   purchase flow as a Phase 4 exit criterion. Phase 5 states the checklist
   and the tooling.

And the contract that outranks features: **the app must build, launch,
browse and take a Cash on Delivery order with zero third-party keys
configured.** No Razorpay key → COD only. No push credentials → no
notification prompt, ever. No Sentry DSN → nothing initialises. A phone that
crashes on a missing key fails the oldest rule in the repository.

---

## Definition of done, per phase

Every phase closes on the same shape of evidence. A phase is not finished
because its features exist.

- `pnpm turbo typecheck lint` clean across every workspace
- The web suites that cover what was touched are green — and after Phase 0,
  **all** of them, once, to prove the move changed nothing
- `pnpm --filter web run audit` still passes: SEO 100, a11y 100, script budget
  held at ≤190 KB (200 KB on the product page)
- New behaviour has an assertion that would fail without it
- Comments explain *why*, with the rejected alternative and any measured
  number
- Docs, `.env.example` and this index updated if a rule, a schema, an env
  var or a decision changed
- Works with the relevant third-party key **removed**

From Phase 3 onward, add:

- `pnpm --filter mobile exec expo-doctor` clean
- A **Release** build, not a development build, installed on physical
  Android hardware and launched
- The size figures from Phase 5 recorded, not estimated

---

## Related

[`AGENTS.md`](../../AGENTS.md) · [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) ·
[`docs/DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md) ·
[`docs/PERFORMANCE.md`](../PERFORMANCE.md) ·
[`docs/SECURITY.md`](../SECURITY.md) ·
[`docs/CONTRIBUTING.md`](../CONTRIBUTING.md) ·
[`research/mobile-stack-research.md`](../../research/mobile-stack-research.md)
