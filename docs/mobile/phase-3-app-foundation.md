# Phase 3 — App foundation

**Deliverable:** an Expo app in `apps/mobile/` that browses the catalogue
offline, looks like Ekmool, navigates instantly, and **launches from a
Release build on real hardware**. No checkout, no payment, no account.

**The exit criterion that decides the phase** is not a feature. It is a
`production` EAS build installed on a physical Android device and a
TestFlight build on a physical iPhone, both launching to the catalogue. See
§8 — everything else in this phase is arranged around getting there early.

---

## 1. Scaffolding

```bash
cd apps
pnpm create expo-app@latest mobile --template default --no-install
cd mobile
```

Then edit `package.json` to `"name": "mobile"` and install with exact
versions rather than accepting whatever `expo install` resolves on the day:

```bash
pnpm --filter mobile add \
  expo@57.0.11 expo-router@57.0.11 react-native@0.86.2 react@19.2.3 \
  react-native-screens@4.27.0 react-native-safe-area-context@5.8.1 \
  react-native-gesture-handler@3.1.0 react-native-reanimated@4.5.3 \
  react-native-worklets@0.11.3 \
  expo-image@57.0.2 expo-font expo-splash-screen expo-status-bar \
  expo-constants expo-linking expo-secure-store@57.0.1 expo-sqlite \
  expo-crypto expo-updates@57.0.12 expo-build-properties \
  @shopify/flash-list@2.3.2 \
  @reduxjs/toolkit react-redux \
  @ekmool/core@workspace:* @ekmool/contracts@workspace:* @ekmool/tokens@workspace:*
```

`pnpm --filter mobile exec expo install --check` afterwards, which is the
tool's own answer to "are these the versions SDK 57 expects". Fix what it
flags; do not argue with it.

**No `metro.config.js` beyond the Expo default.** If a generated one
contains `watchFolders`, `resolver.nodeModulesPath`,
`resolver.extraNodeModules` or `resolver.disableHierarchicalLookup`, delete
those keys — Expo's monorepo guide is explicit that they are now wrong, and
every tutorial older than SDK 52 tells you to add them.

**No `android/` or `ios/` directory** (D8). Add both to `.gitignore` before
the first `prebuild` runs locally, so a stray local prebuild cannot be
committed by accident.

### pnpm and native build scripts

pnpm 11 refuses lifecycle scripts unless allowed. Add to
`pnpm-workspace.yaml` **as they are needed, each with a reason**:

```yaml
allowBuilds:
  esbuild: true        # expo CLI toolchain
```

The field is `allowBuilds`, a map of name to boolean — **not**
`onlyBuiltDependencies`, which is the pnpm 10 spelling and is what this
document said until Phase 3 checked the file. The map form matters: it
records a deliberate `false` as well as a `true`, which is how
`core-js: false` came to be written down rather than silently ignored.
`@sentry/cli` is already allowed there from Phase 0.

Adding entries pre-emptively defeats the point of the mechanism, which is
that every package permitted to run code at install time was looked at.

---

## 2. `app.config.js`

TypeScript, not `app.json`, because it needs to read the environment:

```ts
export default (): ExpoConfig => ({
  name: "Ekmool",
  slug: "ekmool",
  scheme: "ekmool",
  version: "1.0.0",                        // D9: local, reviewed in the diff
  orientation: "portrait",
  userInterfaceStyle: "light",             // see §4
  newArchEnabled: true,                    // the only architecture since SDK 55
  android: {
    package: "in.ekmool.app",
    edgeToEdgeEnabled: true,
    adaptiveIcon: { /* … */ },
  },
  ios: { bundleIdentifier: "in.ekmool.app", supportsTablet: false },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    ["expo-splash-screen", { /* … */ }],
    ["expo-build-properties", {
      android: {
        // R8 + resource shrinking. On in EAS production builds by default;
        // stated here so a local or self-hosted build produces the same
        // artefact as the cloud one. Full mode is deliberately absent —
        // it breaks reflection-based libraries and belongs in Phase 5 as a
        // measured experiment, not as a default nobody tested.
        enableProguardInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
      },
    }],
  ],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
});
```

**`supportsTablet: false`** is a real decision, not an oversight. A tablet
layout is a second design system, and the target user named in
`docs/PERFORMANCE.md` is "on a mid-range Android phone on a 4G connection in
an Indian city". Shipping an unconsidered stretched-phone layout on iPad is
worse than not shipping one.

**`userInterfaceStyle: "light"`.** The design system has one field: paper,
cream, and one dark band per page. There is no dark palette, and inventing
eleven dark tokens without the design intent behind them would break the
contrast floor in ways nobody would catch. If dark mode is wanted, it is a
design exercise first and a code change second.

### Environment variables

`EXPO_PUBLIC_API_URL` is compiled into the bundle, exactly like
`NEXT_PUBLIC_*`. `docs/SECURITY.md`'s rule carries over unchanged:
**anything with that prefix is public**. No secret ever goes in
`app.config.js`, `extra`, or an `EXPO_PUBLIC_` variable. The Razorpay key id
is publishable and may; nothing else may.

---

## 3. Navigation — flat, and fast because of it

### The route tree

```
app/
  _layout.tsx                  root Stack — one native stack, the whole app
  (tabs)/
    _layout.tsx                NativeTabs, four tabs, no nested stacks
    index.tsx                  Shop
    search.tsx                 Search
    saved.tsx                  Saved
    orders.tsx                 Orders
  product/[slug].tsx           pushes onto the ROOT stack
  cart.tsx
  checkout/…                   Phase 4
  order/[id].tsx
  track.tsx
  content/[key].tsx            legal + editorial pages
  +not-found.tsx
```

**Every tab is a single screen. Every detail screen pushes onto the root
stack, not onto a per-tab stack.** This is the architecture, and it is not
negotiable in this codebase for two independent reasons:

1. **`expo/expo#47687`.** Open at the time of writing: on iOS **Release**
   builds only, expo-router with a `Tabs` layout where each tab hosts its
   own nested `Stack` hangs forever on the native splash screen. The
   navigator's first Fabric commit never completes. Debug builds never
   reproduce it, which is the worst possible property for a defect to have.
   The reported fix — flatten the tabs — took a production app from 0/10 to
   10/10 successful launches.
2. **It is faster anyway.** One native stack means one set of native view
   controllers, one back-gesture owner, and fewer screens retained in memory
   than four parallel histories. The nested-stack pattern buys per-tab back
   history; a four-tab shop does not need it and users do not expect it.

The cost is real and should be stated: pushing a product from Search and
then switching to Shop loses the product's place in the Search stack. For a
catalogue of five products that is not a loss anyone will feel.

### `NativeTabs`, not the JavaScript `Tabs`

`expo-router/unstable-native-tabs` renders the platform's own tab bar —
`UITabBarController` on iOS, the Material bottom bar on Android — rather
than a JavaScript reimplementation. It is the faster component, it is the
one that gets platform behaviours (long-press previews, iOS 26 liquid glass)
for free, and per §47687 it is the variant the reporting developers did not
see hang.

`unstable-` in the name is a real warning: the API may change in a minor
version. That is a known cost, priced against a documented Release-build
hang in the alternative. **Pin `expo-router` exactly** (not `^`) so a minor
bump is a deliberate act with a smoke test attached.

Requires `react-native-screens` ≥ 4.16; we are on 4.27.

### Where transitions come from

Native stack transitions are native. `react-native-reanimated` is present
because expo-router requires it, **not because screens should animate in
JavaScript**. The design system allows 150–300ms, colour and opacity only,
honouring reduced motion. On the phone that means:

- Screen transitions: the platform's, untouched.
- Press states: `Pressable`'s `android_ripple` and an opacity change.
- Anything else: justify it in the PR, and check
  `AccessibilityInfo.isReduceMotionEnabled()` — the web has a global CSS
  rule catching this and React Native has no equivalent, so it is per
  component and it will be forgotten unless it is a review item.

There is a second reason to be sparing: the SDK 57 changelog records that
**Hermes V1 with reanimated raises memory use 25–30%**, with a worklets
bundle-mode workaround. On a mid-range Android phone that is not free.

---

## 4. Theming — tokens in, StyleSheet out

`@ekmool/tokens` gives colour and type. The app adds a small primitive layer
mirroring `src/components/ui/`, so a screen is written the same way on both
clients:

| Web | Mobile | Notes |
|---|---|---|
| `Button` / `ButtonLink` | `Button` | `minHeight: 44`, `accessibilityRole="button"`, ripple on Android |
| `Eyebrow` | `Eyebrow` | uppercase, `letterSpacing: 0.18 * fontSize` — RN takes absolute points, not em |
| `SoilLine` | `SoilLine` | the hand-drawn horizon rule, as `react-native-svg` **or** a pre-rendered asset — see below |
| `GIChip` | `GIChip` | |
| `PhotoPlaceholder` | `PhotoPlaceholder` | the toned art-direction stand-in, same tones, same `direction` prop becoming the `accessibilityLabel` |
| `Reveal` | — | **not ported.** A scroll-in animation on a phone costs a worklet per card to reproduce an effect that reads as lag on a mid-range device. |

**`SoilLine` needs a decision, not a port.** It is a signature and the
design system says it appears once per page. If it is SVG,
`react-native-svg@15.15.5` is a native dependency taken for one decorative
rule. Prefer a single pre-rendered WebP at 3× — it is one asset, it is
smaller than the library, and the rule does not animate. Take
`react-native-svg` only if Phase 4 finds a second and third genuine need.

### Type

Marcellus 400 and Figtree 400/500/600, loaded with `expo-font`. Both are
already self-hosted for the web, so the same files are in the repository and
the same Latin + ₹ subsets apply. Four weights across two families is four
files in the binary; do not add a fifth "for headings", because the design
system is explicit that hierarchy comes from size, letter-spacing and case,
never from synthesised weight.

Load them via the `expo-font` config plugin (embedded at build time) rather
than `useFonts` at runtime — embedding avoids a first-frame flash of the
system font, which on a brand whose whole argument is typographic is worth
the plugin.

### Dynamic type

iOS and Android both let a user scale text system-wide. The web's floor is
"nothing below `text-15`"; the phone's equivalent is that the layout must
survive 200% scaling. Use `allowFontScaling` (the default, on) and **test at
200% as a Phase 5 checklist item**. Do not set `allowFontScaling={false}` to
fix a broken layout; that is the mobile equivalent of removing a focus ring.

---

## 5. Data layer

### The cached-resource hook (D6)

One hook, roughly 80 lines, over `expo-sqlite/kv-store`:

```ts
useCachedDocument<T>(url: string, key: string): {
  data: T | null; state: "cold" | "fresh" | "stale" | "offline"; refresh(): void
}
```

Behaviour:

1. Read the cached body and its ETag from `kv-store` **synchronously**
   (`getItemSync`) and render it immediately. No spinner on a warm start —
   this is the single biggest perceived-performance decision in the app.
2. Fetch with `If-None-Match`. `304` → mark fresh, no re-render. `200` →
   store and re-render. Network error → keep serving the cache and set
   `state: "offline"`.
3. Cold start with no cache and no network → the empty state, which says
   what is wrong and offers retry. Not a spinner that never resolves.

This is the same shape as the web's service worker, which
`docs/CONTRIBUTING.md` records as a deliberate 250-line hand-write in
preference to Workbox. The reasoning transfers.

**Why not TanStack Query** — recorded as D6 with its reversal condition. It
is a good library; the catalogue is one document.

**Why `expo-sqlite/kv-store` and not `react-native-mmkv`** — mmkv v4 needs
`react-native-nitro-modules`, a second native dependency, to store a cart.
`kv-store` is a drop-in AsyncStorage-compatible API with synchronous reads,
already inside `expo-sqlite`, which is already in the SDK. Zero new native
modules.

### The API client

One module, `src/api/client.ts`:

- Base URL from `EXPO_PUBLIC_API_URL`, no hardcoded host anywhere else.
- Attaches `X-Ekmool-Client`, `X-Ekmool-Install`, and `Authorization` when a
  session exists.
- Parses the error envelope into the `@ekmool/contracts` code union and
  returns a discriminated result — **never throws for an expected refusal**.
  `INSUFFICIENT_STOCK` is not an exception; it is an answer, and the screen
  that asked has to render it.
- `RATE_LIMITED` → surface the server's `retryAfter` in plain words. Not
  "429".
- **No automatic retry on any non-idempotent request.** Checkout takes an
  `Idempotency-Key`; a retry without one is a second order.

### Cart

The RTK slice from `@ekmool/core` (D7), with `expo-sqlite/kv-store` behind
the `CartStorage` interface Phase 1 defined. Same versioned key, same
reducers, same total arithmetic. Two clients, one cart implementation, no
drift.

> **The key is `ekmool.cart.v2`** — `CART_STORAGE_KEY` in
> `packages/core/src/cart/persistence.ts`. This document said `v1` until
> Phase 3 checked it. `v1` is the **legacy** key, read once and migrated
> from; on the web, writing to it would silently empty the basket of every
> customer who has one. Import the constant. Do not retype the string.

### Session

`expo-secure-store` — Keychain / EncryptedSharedPreferences. Never
`kv-store`, which is a plain SQLite file. A `401` clears it and returns to
the lookup screen without retrying.

---

## 6. Offline

The web ships a service worker precisely so browsing survives a bad
connection. The phone should be **better** at this, not worse, because it
has real storage.

- Catalogue, reviews and content documents cached and served first. The app
  browses on a train with no signal.
- **Images are the hard part.** `expo-image` has a disk cache; SDK 57 added
  `writeToCacheAsync` / `readFromCacheAsync` for seeding it by cache key.
  Do **not** prefetch every product image on first launch — that is a
  multi-megabyte download on a metered connection, decided for the customer.
  Cache on view.
- **Nothing about checkout is cached, ever.** The web's service worker
  excludes `/api`, `/checkout`, `/orders`, `/account`, `/admin` and
  `/track`, and `test:offline` asserts it. The phone's rule is the same and
  needs no cache layer to enforce it — but it does need someone not to add
  one later, so it goes in a comment at the top of the cache module.
- An order placed offline is **not** queued. The web has an offline order
  outbox (`src/lib/offline-queue.ts`); replicating it here means a customer
  believing an order exists when no server has heard of it, on a device that
  may not be opened again for days. Phase 4 states the offline checkout
  behaviour explicitly: the button is disabled, with a sentence saying why.

---

## 7. What the screens do in this phase

Enough to prove the foundation, no more:

- **Shop** — the five products from the cached catalogue, `FlatList`, not
  FlashList (five items; recycling earns nothing). Real prices, real GI
  chips, no ratings.
- **Search** — `@ekmool/core/search`, the same ranking as the web,
  in-memory over the cached catalogue. Works offline. Matches "haldi" to
  turmeric, because that is what the shared module does.
- **Product** — description, variants, price, the PhotoPlaceholder. An
  "Add to cart" button that adds to the cart. No checkout.
- **Saved / Orders** — empty states only, correctly written. An empty state
  is not a placeholder; it is copy, and the design system's voice applies.
- **Content** — legal and editorial pages from `content-v1.json`, rendered
  through the same markdown renderer the web uses if it is portable, or a
  minimal renderer if it is not. It is a hand-written renderer with no
  dependency; check before assuming either way.

---

## 8. The gate: a Release build that launches

**Do this in the first week of the phase, on a skeleton app, before any
screen is finished.** The defect this is looking for is invisible in
development and appears only in Release, and finding it in Phase 6 with a
store deadline is the difference between a bad afternoon and a bad month.

```bash
pnpm --filter mobile exec eas build --profile production --platform android
# install the AAB via bundletool, or a production-signed APK profile, on
# real hardware — not an emulator
pnpm --filter mobile exec eas build --profile production --platform ios
# → TestFlight → a physical iPhone
```

Assert, on both:

- [ ] The app launches past the native splash to the catalogue, ten times
      out of ten, from cold
- [ ] Tab switching and product push feel immediate
- [ ] Airplane mode: the catalogue still renders from cache
- [ ] No red screen, no silent hang

An emulator does not count. `expo/expo#47687` is timing-sensitive and
reported as appearing in "larger apps" and Release builds; a device that is
faster or slower than the target hardware is not evidence.

If iOS hangs despite the flat structure, that is the D1 reversal condition:
pin SDK 56, re-run this gate, and record what happened in
`research/mobile-stack-research.md` — with the build numbers, because a
future reader will want to know whether 58 fixed it.

---

## Exit criteria

- [ ] `pnpm turbo typecheck lint` clean, mobile included
- [ ] `pnpm --filter mobile exec expo-doctor` clean
- [ ] The Release-build gate in §8 passed on **physical** Android and iOS
      hardware
- [ ] Airplane mode: catalogue, search and product all work from cache
- [ ] `pnpm --filter web run audit` unchanged — the web must not have moved
- [ ] No hex literal anywhere in `apps/mobile/`; a grep check in CI
- [ ] No `@react-navigation/*` imported directly
- [ ] No per-tab nested `Stack` — a grep check, with §47687 linked in the
      failure message so the next person knows why
- [ ] Cold-start time to first catalogue paint recorded on the target
      device. A number, not an adjective. It becomes Phase 5's baseline.
- [ ] `docs/mobile/` gains an `app-architecture.md` if the route tree grows
      past what this document describes

---

## Related

[Programme index](README.md) · [← Phase 2](phase-2-mobile-api.md) ·
[Phase 4 →](phase-4-commerce-flows.md) ·
[`research/mobile-stack-research.md` §2](../../research/mobile-stack-research.md) ·
[`docs/DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md)
