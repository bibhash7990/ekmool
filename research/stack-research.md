# EKMOOL — Stack Research (Milestone 0)

Date: 2026-08-04 · Verified against live npm registry + current official docs (via context7 / web) — not memory.
Environment: Windows 11 · Node v22.22.3 · npm 10.9.8 · Docker 29.6.1 (daemon running) · MySQL not installed natively.

---

## 0. Capability inventory (spec M0.1)

**Skills available in this session and how they'll be used:**

| Skill | Use in this project |
|---|---|
| `ui-ux-pro-max` (UI/UX design intelligence: styles, palettes, font pairings, UX guidelines) | Consulted at M1 for heritage-brand art direction and anti-"AI-template" review. Closest available equivalent to a `frontend-design` skill — no skill named exactly that exists. |
| `vercel-react-best-practices` (React/Next.js performance patterns from Vercel Engineering) | Applied at M1–M3 while writing components (RSC boundaries, bundle discipline) and at M6 perf pass. |
| `design-review` | Run after M1 and M6 as the visual QA gate against the Section 5 banned-list. |
| `imprint` | After M1 primitives are built, extract visual patterns to a ui-registry for consistency. |
| Others present (docx/pdf/xlsx, gstack suite, operations/engineering packs) | Not relevant to this build. |

**MCP servers connected:** `context7` (live library docs — used throughout), `filesystem`, `magic`, in-app Browser tools (used for visual verification of pages), `visualize`. Plugin servers (figma, github, slack, …) require OAuth and are **not needed** for this build.

**Conclusion:** no capability gaps; design skills substitute for the hypothesised `frontend-design` skill.

---

## 1. Pinned versions + integration decisions

| Package | Pinned | Why / gotchas found in docs |
|---|---|---|
| `next` | **16.3.0** | Current stable (16.3 line, Aug 2026). See §2 for brief corrections. Turbopack is default bundler for dev **and** build. React 19.2 bundled. `output: 'standalone'` supported unchanged. `images.qualities` default `[75]`, `minimumCacheTTL` 4 h. |
| `react`, `react-dom` | 19.2.x (ships with create-next-app) | No action needed. |
| `tailwindcss` + `@tailwindcss/postcss` | **4.3.3** | CSS-first config: tokens in `@theme` inside `globals.css`; `--color-*` namespace auto-generates `bg-…`/`text-…` utilities; `--text-*` generates the type scale. **No `tailwind.config.ts` in the project at all.** |
| `@clerk/nextjs` | **7.6.4** (Core 3) | `clerkMiddleware()` + `createRouteMatcher` run inside Next 16 `proxy.ts`. Keyless mode is **dev-only**; a production build that mounts `ClerkProvider` without keys throws → provider is scoped to `admin/` + `account/` layouts only, and those call `notFound()` when keys are absent. Role check via `sessionClaims.metadata.role` requires one-time Dashboard session-token customization `{"metadata": "{{user.public_metadata}}"}` (documented in docs/keys-needed.md). |
| `@sentry/nextjs` | **10.69.0** | Peer supports Next 16 + Turbopack. File set: `instrumentation.ts` (+ `onRequestError = Sentry.captureRequestError`), `instrumentation-client.ts` (+ `onRouterTransitionStart`), `sentry.server.config.ts`, `sentry.edge.config.ts`, `withSentryConfig` wrapper. All inits DSN-guarded. Client SDK is the main threat to the 170 KB script budget — fallback ladder documented in plan (drop `browserTracingIntegration` → errors-only). |
| `posthog-js` | **1.410.6** | Reverse proxy = plain `rewrites()`: `/ingest/static/:path*` → `us-assets.i.posthog.com`, `/ingest/:path*` → `us.i.posthog.com`, plus `skipTrailingSlashRedirect: true` (required by PostHog docs). Deliberately using plain `posthog-js` dynamically imported on idle (not the `@posthog/next` wrapper) to keep it out of first-load JS. |
| `razorpay` | **2.9.8** | Server-side only; client constructed lazily. Webhook: HMAC-SHA256 over the **raw body** (`await req.text()` before any parse) compared with `crypto.timingSafeEqual` — hand-rolled with `node:crypto` instead of the SDK's deep-import util to avoid path drift. checkout.js only on `/checkout` via `next/script` `lazyOnload`. |
| `nodemailer` | **9.0.3** | Major 9 current (brief implied older). `createTransport({ host: 'smtp-relay.brevo.com', port: 587, auth })` unchanged. Behind `MailProvider` interface. |
| `@reduxjs/toolkit` + `react-redux` | **2.12.0** / 9.x | Official App Router pattern: `makeStore()` factory + `StoreProvider` client component holding store in `useRef`. Persistence via `createListenerMiddleware` → localStorage (versioned key `ekmool.cart.v1`); hydration by post-mount dispatch + `hydrated` flag so server HTML always renders the empty-cart state (no mismatch). Server data never enters Redux. |
| `mysql2` | **3.23.2** | `mysql2/promise` pool singleton, `connectionLimit: 20`, `queueLimit: 100`; handles MySQL 8.4 `caching_sha2_password`. Migration runner uses its own `multipleStatements: true` connection, never the app pool. |
| `zod` | **4.4.3** | Zod 4: prefer `z.email()` etc. over deprecated string chains. |
| `node-cron` | **4.6.0** | v4: `cron.schedule(expr, fn, { timezone: 'Asia/Kolkata' })` → 08:00 IST job is trivial. |
| `ulidx` | **2.4.1** | ULID for `orders.id` (CHAR(26)). |
| `@next/mdx` | latest matching next 16.3 | Turbopack constraint: remark/rehype plugins must be **string-form serializable** (`remarkPlugins: [['remark-gfm']]` style with names, no function options). Folder-per-post `page.mdx` + typed `blog-registry.ts`; `next-mdx-remote` not needed. |
| `cross-env` | dev dep | npm scripts run under cmd.exe on Windows; no inline `VAR=x`. |
| k6 | latest via `winget install k6 --source winget` | Load scripts in `scripts/k6/`. 10k VU on one laptop: `discardResponseBodies: true`, arrival-rate fallback documented in script headers. |
| MySQL | Docker image **`mysql:8.4`** (LTS of "MySQL 8") | Via docker-compose; healthcheck with `mysqladmin ping`; utf8mb4 server flags. |

---

## 2. Doc-driven corrections to the project brief (spec said → reality)

1. **"Next.js 15+"** → current stable is **16.3.0**; still satisfies "15+". Adopted.
2. **`middleware.ts`** → renamed **`proxy.ts`** (exported `proxy()` function) in Next 16, runs Node.js runtime — which is *good* for us: the in-memory token-bucket rate limiter can use plain module state.
3. **`revalidateTag('products')`** → 2-arg form **`revalidateTag('products', 'max')`** (single-arg deprecated). Because catalog reads are raw SQL (no fetch cache), tagging happens via **`unstable_cache(fn, keys, { tags: ['products'], revalidate: 3600 })`** — verified to work **without** the `cacheComponents` flag. `cacheComponents` stays **OFF**; classic SSG (`generateStaticParams` + `export const revalidate = 3600`) is the model. `/api/revalidate` also calls `revalidatePath()` on public routes as belt-and-braces.
4. **`next lint`** → removed in 16; run `eslint` CLI with flat config.
5. **First-load JS readout** → `next build` no longer prints it; the 170 KB budget is enforced from **Lighthouse JSON** (`scripts/check-budget.mjs` sums script transfer sizes).
6. **Sentry client config file** → `sentry.client.config.ts` replaced by **`instrumentation-client.ts`**.
7. **Async request APIs** → `params`/`searchParams`/`cookies()`/`headers()` must be awaited everywhere (sync access removed in 16).
8. **Tailwind config file** → brief's "Tailwind theme tokens" implemented as v4 `@theme` CSS, not a JS config (brief's intent — tokens, never hardcoded hex — unchanged).
9. **nodemailer / zod / node-cron majors** → 9.x / 4.x / 4.x respectively; APIs adjusted as noted above.

No other contradictions between the brief and current docs were found; everything else in the brief maps cleanly.

---

## 3. Caching & ISR design (locked)

- Public pages: `export const revalidate = 3600` + `generateStaticParams` (products, blog) + `dynamicParams = false` for the 5 known product slugs.
- DB reads for catalog wrapped in `unstable_cache(..., { tags: ['products'], revalidate: 3600 })` so build-time SSG, ISR regeneration, and on-demand `revalidateTag('products', 'max')` all share one invalidation story.
- Zero DB at request time on browsing paths — proven by the M2 "DB stopped" test (`docker stop ekmool-mysql` → all public routes 200).
- Checkout/webhook/admin/jobs are the only DB-touching surfaces (Node runtime route handlers).

## 4. Graceful-degradation contract (no third-party keys)

`src/lib/env.ts` computes capability flags once (prefix-validated so placeholders count as absent): `hasClerk` (`pk_…`), `hasRazorpay` (key id + secret), `hasSmtp`, `hasSentry` (DSN), `hasPosthog` (`phc_…`).

| Service absent | Behavior |
|---|---|
| Clerk | `/admin` + `/account` → 404; nav hides account; proxy does rate-limiting only; ClerkProvider never mounted; build unaffected. |
| Razorpay | COD-only checkout with a quiet "online payment coming soon" note; API rejects `paymentMethod: 'razorpay'` with 400; webhook → 503 `NOT_CONFIGURED`; checkout.js never loaded. |
| Brevo SMTP | `NoopProvider` writes `email_log` rows with `status='skipped_no_smtp'` + one-line console summary. Orders unaffected. |
| Sentry | No init, no script, no network. |
| PostHog | Loader renders nothing; no dynamic import; rewrites inert. |

Acceptance (tested in M3/M6): `.env.local` containing only `DATABASE_*`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `REVALIDATE_SECRET` → `npm run build && npm run start` succeeds and a COD order completes end-to-end.

## 5. Key sources

- Next.js 16 release notes + upgrade guide (nextjs.org/blog/next-16, /docs/app/guides/upgrading/version-16) — proxy.ts, async APIs, revalidateTag 2-arg, lint removal, Turbopack default.
- Tailwind v4 docs — `@theme` directive, `--color-*` / `--text-*` namespaces.
- Clerk docs — clerkMiddleware reference, Core 3 changelog, keyless-mode scope, session-token customization for `publicMetadata`.
- Sentry Next.js manual setup — instrumentation file set, Turbopack support.
- PostHog Next.js reverse-proxy guide — rewrite rules + `skipTrailingSlashRedirect`.
- Redux Toolkit "Usage with Next.js" — per-request store, provider-in-useRef.
- Razorpay webhook validation docs — raw body HMAC-SHA256 + `x-razorpay-signature`.
- nodemailer changelog (major 9), zod v4 migration notes, node-cron v4 README (timezone option).
- Grafana k6 install docs (winget/choco on Windows).
- npm registry lookups for every exact version above.
