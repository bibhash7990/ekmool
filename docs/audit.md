# Lighthouse audit — M6

Measured 2026-08-04 against a **production build** (`npm run build` → `npx next start -p 3100`)
with **no third-party keys configured** — the default state of a fresh clone.

- Lighthouse 13.4.1 (via `npx`), Chrome stable, headless
- Mobile form factor with default screen emulation and network throttling
- Reports: `research/audits/lh-{home,catalog,product,blog}.json`

Reproduce:

```bash
npm run build && npx next start -p 3100
```

```bash
node scripts/audit.mjs 3100
```

The script fails the process on any gate breach, so it works unchanged as a CI step.

## Results

| Page | Perf | A11y | BP | SEO | JS | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| `/` | 99 | 100 | 100 | 100 | 166 KB | 2.1 s | 0 | 30 ms |
| `/products` | 99 | 100 | 100 | 100 | 169 KB | 2.0 s | 0 | 30 ms |
| `/products/lakadong-turmeric-powder` | 98 | 100 | 100 | 100 | 169 KB | 2.3 s | 0 | 30 ms |
| `/blog/what-is-a-gi-tag` | 97 | 100 | 100 | 100 | 166 KB | 2.5 s | 0 | 30 ms |

Gates: SEO = 100, Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95,
script transfer ≤ 170 KB, and zero off-origin requests. **All pass.**

CLS is 0 on every page, which is the point of reserving space for the variant
picker and keeping the sticky add-to-cart bar below the fold.

Scores drift a point or two between runs on a loaded laptop; the thresholds are
set where a normal run has headroom, not at the exact numbers above.

## What the first run caught

The gates were not green on the first pass. Two real defects, both fixed:

### 1. Gold text failed contrast — `/` accessibility 96

`--color-ek-gold-600` (`#c4881f`) was commented in `globals.css` as "accessible
gold text on paper". It is not: against `--color-ek-paper` it measures **2.84:1**,
below even the 3:1 floor for large text. Lighthouse flagged the 46 px accent word
in the hero `<h1>`.

The same token was also used for the blog index link at 15 px (needs 4.5:1), the
"View cart" link, the GI chip's seal icon on a `gold-100` field, and two hover
states — none of which Lighthouse evaluates, so the single reported failure was
under-counting the problem.

Fix: added `--color-ek-gold-800: #8a5d0d`, measured against every light surface
in the palette (4.75:1 on gold-100, 5.02:1 on cream, 5.38:1 on paper), and moved
all seven gold-as-ink usages onto it. `gold-500`/`gold-600` remain for fills,
rules, and use on dark green, and the misleading comment is corrected.

Home accessibility went 96 → 100.

### 2. Sentry shipped 12.7 KB to every visitor, with or without a DSN

`/products` and the product page came in at **172.2 KB**, over the 170 KB budget.

`instrumentation-client.ts` used a static `import * as Sentry from "@sentry/nextjs"`.
A top-level import cannot be tree-shaken away by a runtime `if (dsn)` check, so
the SDK sat in the shared client chunk and was downloaded by every visitor even
though nothing initialised it.

Fix: the SDK is now `await import()`-ed inside the DSN check, which moves it into
its own chunk. With no DSN that chunk is never requested. Budget dropped to
169 KB — and the saving is larger than the 2.2 KB overage suggests, because the
12.7 KB was being paid by all 10,000 concurrent browsing users.

`onRouterTransitionStart` still has to exist synchronously at module scope, so it
is a thin forwarder that no-ops until the SDK resolves.

## Monitoring verified against a live DSN

Absent config proves nothing loads; it does not prove the wiring works. So the
site was rebuilt with a test DSN and checked in-browser:

- `Sentry.init()` ran, `tracesSampleRate: 0`, `sendDefaultPii: false`
- `captureException()` produced exactly **one** network request, to
  `http://localhost:3100/monitoring?…` — the `tunnelRoute`, not `sentry.io`
  directly, which is what keeps error reports alive through ad-blockers

That check also caught a third defect. The config passed `integrations: []`
intending errors-only, but in Sentry 10 that means "add nothing *beyond* the
defaults" — `BrowserTracing` and `BrowserSession` were both still active, and
`BrowserSession` fires a request on every pageview. Defaults are now filtered by
name; the loaded integration list confirms both are gone. `Breadcrumbs` is kept
deliberately — it is cheap and it is most of what makes a captured error
diagnosable.

## Third-party isolation with no keys

Loaded `/products/lakadong-turmeric-powder`, waited 5 s to pass the PostHog idle
loader's window, then read every resource entry:

- 21 requests, **all** to `localhost:3100`
- the sole off-origin entry is an inline `data:` URI (the grain texture SVG), not
  a network request
- `window.__SENTRY__`, `window.posthog`, `window.Razorpay` all undefined

Self-hosted fonts (`next/font/google`) mean there is no `fonts.googleapis.com`
request either. This is now enforced by the audit script rather than eyeballed —
`scripts/audit.mjs` fails on any off-origin request, so a future dependency that
phones home breaks the build instead of quietly shipping.

## Known limits

- Scores come from one laptop, not a CI runner or a real device lab. Treat the
  gates as regression detection, not as field data.
- `/checkout` is not audited. It is `noindex`, and with a Razorpay key present it
  loads `checkout.js` from Razorpay's CDN, which would fail the off-origin gate
  by design. Audit it separately if its performance ever matters.
- The budget is measured as script *transfer* size from the Lighthouse
  `network-requests` audit, not `next build` output — Next 16 no longer prints
  First Load JS.
