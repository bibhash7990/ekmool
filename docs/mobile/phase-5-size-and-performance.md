# Phase 5 — Size, performance and accessibility

**Deliverable:** measured numbers for download size, cold start and
interaction latency; a written budget for each; and a gate that fails when
one is exceeded.

**Why it is a phase and not a task.** `docs/PERFORMANCE.md` opens with
*"Every rule here follows from one measurement"* and closes with *"Before
claiming something is faster, measure it"* — and records two `next/dynamic`
findings that both contradicted the obvious expectation, one of which made a
page heavier. The same discipline applies here, and it cannot be applied
while features are still landing.

---

## 1. Measure the right thing

**The number that matters is the Play Store download size**, not the APK.

Expo's own figures for a React Native 0.73+ app:

| Artefact | Size |
|---|---|
| Release APK (universal) | 62.1 MB |
| App Bundle (`.aab`) | 27.4 MB |
| **Google Play download** | **11.7 MB** |
| iOS blank template, App Store download | just under 4 MB |

Play serves a device-specific split from the AAB. **No customer ever
downloads the universal APK.** Anyone tracking this requirement by looking
at an APK is measuring a number that does not exist in the world, and the
first thing to do in this phase is make sure that is not how it gets
tracked.

### How to get the real numbers

- **Android** — upload the AAB to the Play Console's internal testing track
  and read the size report per device configuration. That is the
  authoritative figure. Android Studio's APK Analyzer on the AAB gives a
  close estimate and a per-component breakdown, which is what to use while
  iterating.
- **iOS** — upload to TestFlight and read App Store Connect's estimated
  download size per device. There is no Mac in this environment, so
  `assetutil` on an unzipped `.ipa` is not available. **Say so in the
  record** rather than quoting a number from somewhere else.
- **JavaScript** — `EXPO_ATLAS=true pnpm --filter mobile exec expo export`,
  then `pnpm --filter mobile exec expo-atlas`. Atlas visualises the bundle
  per module. It measures JS only; it says nothing about native size, and
  conflating the two is the most common mistake in this area.

---

## 2. The budgets

Set after the first measurement, not before — a budget invented in advance
is either so loose it catches nothing or so tight it gets waived, and
`docs/PERFORMANCE.md` is explicit that *"a generous budget catches nothing,
which is the only thing a budget is for"*.

Fill these in from the Phase 3 skeleton build, then hold them:

| Metric | Device | Baseline | Budget |
|---|---|---|---|
| Play download size | mid-range Android, `arm64-v8a` | _measure_ | baseline + 15% |
| App Store download | iPhone | _measure_ | baseline + 15% |
| JS bundle (Hermes bytecode) | — | _measure_ | _+10%_ |
| Cold start → catalogue painted | the target mid-range device | _measure_ | _+20%_ |
| Warm start → catalogue painted | same | _measure_ | should be near-instant: the cache is read synchronously |
| Tab switch | same | — | no perceptible delay |
| Product push | same | — | no perceptible delay |

**Measure on the target device**, which `docs/PERFORMANCE.md` names: a
mid-range Android phone on 4G in an Indian city. A flagship makes every
number look fine and none of them true.

Record every figure in `research/mobile-audits/` alongside the web's
`research/audits/`, with the build number and the device. A number without a
device is not a measurement.

---

## 3. The levers, in the order worth pulling

Each with what it is actually worth and what it costs.

| Lever | Worth | Cost / caveat |
|---|---|---|
| **Ship an AAB, never a universal APK** | The whole 27.4 → 11.7 MB gap | None. Default on EAS `production`. Verify it is not overridden. |
| **Hermes bytecode** | JS 30–50% smaller than JSC, faster start | Default and mandatory since the New Architecture. Not a decision. |
| **R8 + `shrinkResources`** | Cited at 30–50% off compiled Java/Kotlin | On in EAS production builds; declared explicitly in `expo-build-properties` (Phase 3) so a local build matches. |
| **Fewer native dependencies** | The largest lever we control | Every native module is compiled code in every split. This is where the app stays small or does not. §4. |
| **Font subsetting** | Two families, four weights, Latin + ₹ | Already subset for the web. Reuse the same files; do not ship a full Marcellus. |
| **No bundled photography** | Potentially megabytes | Already true — `PhotoPlaceholder` is generated, real images come from object storage. **Preserve it.** The moment someone adds a hero JPEG to `assets/`, this line becomes false. |
| `android.enableR8.fullMode=true` | More, unquantified here | **A measured experiment, not a default.** It can break reflection-based libraries — Razorpay's SDK is the obvious candidate — and the breakage appears at runtime in Release. Try it, measure it, and run the full device checklist before keeping it. |
| `useLegacyPackaging: true` | Smaller file | **Slower first launch** — RN 0.73+ stores native libs uncompressed deliberately, for load speed. A trade between two of this phase's own budgets. Measure both sides or leave it alone. |

### The one that is not on the list

Splitting the JS bundle. `expo-router` already splits by route on native
where the platform supports it, and hand-rolling further splitting on a
five-screen shop is the mobile version of the `next/dynamic` finding in
`docs/PERFORMANCE.md`: the loader machinery costs more than the deferred
component saves, for anything that always renders.

---

## 4. The dependency audit

Run Atlas and read the list. For every module above ~50 KB, answer the three
questions from `docs/CONTRIBUTING.md`:

1. What does it do that forty lines of ours would not?
2. What does it pull in?
3. What happens when it is unmaintained in two years?

Specific things to check, because they are the likely offenders:

- **`react-native-razorpay`** — the D4 measurement. Compare the Play
  download size with and without it. If it costs more than about 4 MB, the
  reversal is Standard Checkout in `expo-web-browser` and the webhook
  already makes the server correct either way. **Record the number**,
  whichever way it goes, so nobody re-opens the question from memory.
- **`react-native-svg`** — if it was taken for `SoilLine` alone, it is the
  clearest possible candidate for a pre-rendered WebP instead.
- **`@shopify/flash-list`** — earns its place on the orders and reviews
  lists, which are unbounded. If Phase 4 ended up using it for the
  five-product catalogue too, take it back out of there.
- **Every icon set.** A full icon font for six glyphs is the classic
  unexamined megabyte. Six SVG paths inlined as components, or six small
  assets, beat any icon library here.
- **Moment/date libraries.** There must not be one. `en-IN` dates and IST
  are what `Intl` already does, and the web does it without a library.

---

## 5. Runtime performance

### Cold start

The largest lever is already designed in: the cached catalogue is read
**synchronously** with `getItemSync` and rendered on the first frame. There
is no spinner on a warm start. Verify this actually happens — an accidental
`await` in the read path turns it back into a spinner, and it will look
fine on a fast device.

Other checks:

- The splash screen hides when the first screen is ready, not on a timer.
- No network call blocks the first paint. `/api/v1/bootstrap` is fetched
  with a short timeout **after** paint, with COD-only as the safe default.
- Fonts are embedded at build time (`expo-font` plugin), not fetched, so
  there is no first-frame flash of the system typeface.

### Lists

`FlatList` for the five-product catalogue; FlashList for orders and reviews.
`getItemLayout` or a fixed `estimatedItemSize` where the row height is
known. `keyExtractor` returning a stable id, never an index.

### Images

`expo-image` with explicit width and height. CLS is 0 on all four audited
web pages and *"must stay there"*; the phone's equivalent is that a card
must not resize when its image arrives. Use `placeholder` with the
`PhotoPlaceholder` tone, `contentFit="cover"`, and `recyclingKey` inside
lists so a recycled row does not flash the previous product's photograph.

### Re-renders

Redux selectors must be narrow. A cart badge subscribing to the whole cart
state re-renders on every quantity change in the list; on a mid-range device
that is visible. Select the count, not the cart.

---

## 6. Accessibility — the gate, restated as a checklist

Lighthouse cannot run here, so rule 11's *"accessibility stays at 100"*
becomes a list somebody actually performs. It goes in
`docs/mobile/device-checklist.md` and it is run before every release.

- [ ] **Touch targets 44×44 minimum** on every pressable. This is why
      controls look slightly larger than a designer might draw them, on both
      clients.
- [ ] **`accessibilityLabel` on every icon-only control.** The web's rule is
      `aria-label`; the mechanism differs, the requirement does not.
- [ ] **`accessibilityRole`** on every pressable, header and image.
- [ ] **`accessibilityState`** reflecting disabled, selected, checked.
- [ ] **Contrast 4.5:1 on body text**, 3:1 on large. `gold-800` remains the
      only gold safe as ink. The gold trap is the single most likely way to
      lose this, and it is invisible to the eye — check with a contrast
      tool, not by looking.
- [ ] **Every input has a visible label.**
- [ ] **Errors next to the field.**
- [ ] **Text scales to 200%** without clipping or overlap, on the checkout
      form above all.
- [ ] **`AccessibilityInfo.isReduceMotionEnabled()`** honoured by every
      animation. The web has a global CSS rule; React Native does not, so
      this is per-component and will be missed unless it is reviewed.
- [ ] **A full TalkBack pass** over browse → add to cart → checkout →
      receipt.
- [ ] **A full VoiceOver pass** over the same.
- [ ] **Focus order** follows reading order on every screen.
- [ ] **Announcements** for async results — an order placed, a coupon
      refused — via `AccessibilityInfo.announceForAccessibility`. The web
      uses `role="status"`; a screen change that only shows a new colour
      says nothing to a screen reader.

---

## 7. The gate

A script, `apps/mobile/scripts/check-size.mjs`, in the house style: reads
the Atlas export and the last recorded build size, compares against the
budget in a committed JSON file, prints `PASS`/`FAIL`, exits non-zero.

It runs in CI on the `production` build job. It is not a warning. The web's
budget *"fails the build"* and the headroom is *"thin on purpose"*; a mobile
budget that only warns will be ignored within three sprints.

Where a number cannot be obtained in CI — the Play Console figure needs an
upload — the gate checks what it can (JS bundle, asset directory total) and
the store figure is recorded manually per release in
`research/mobile-audits/`. **Say which numbers are automated and which are
not**, so nobody assumes coverage that is not there.

---

## Exit criteria

- [ ] Play download size and App Store download size measured on real
      tracks and recorded with build numbers and devices
- [ ] Cold and warm start measured on the target mid-range Android device
- [ ] The budget table filled in with real baselines, committed
- [ ] `check-size.mjs` written, wired into CI, and demonstrated failing
      against a deliberately bloated build — *write the assertion so it
      would fail*
- [ ] The D4 Razorpay size measurement recorded and the decision confirmed
      or reversed **with the number**
- [ ] Atlas output reviewed module by module above 50 KB; anything
      unjustified removed
- [ ] No bundled photography; assets directory total recorded
- [ ] The full accessibility checklist run and passed on both platforms
- [ ] `research/mobile-audits/` created, with the first report in it
- [ ] `docs/PERFORMANCE.md` gains a short mobile section pointing here, so
      there is one place that answers "why is this slow"

---

## Related

[Programme index](README.md) · [← Phase 4](phase-4-commerce-flows.md) ·
[Phase 6 →](phase-6-release-engineering.md) ·
[`docs/PERFORMANCE.md`](../PERFORMANCE.md) ·
[`research/mobile-stack-research.md` §4](../../research/mobile-stack-research.md)
