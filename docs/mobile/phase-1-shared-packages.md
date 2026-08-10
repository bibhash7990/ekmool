# Phase 1 — The shared layer

**Deliverable:** three workspace packages holding everything both clients
must agree on, with the web application refactored onto them and its script
budget unmoved.

**Not in this phase:** any new endpoint, any React Native. The mobile app
does not exist yet and must not be imagined into these packages. Everything
here is justified by the web app alone; the phone is the reason there are
two consumers, not the reason for any given line.

**Why before the API and before the app.** Two clients that each compute
GST, or each decide what a coupon refusal means, will disagree — and the
disagreement will surface as a customer being charged a different total in
the app than the web quoted. The only defence is that there is one
implementation and both call it. Doing this after the app exists means
writing the arithmetic twice and then merging it, which is strictly worse
than moving it once now.

---

## The three packages

| Package | Holds | Consumed by |
|---|---|---|
| `@ekmool/core` | Money, GST, coupon arithmetic, delivery bands, order-status vocabulary, catalogue search, the catalogue types, the cart slice | web, mobile |
| `@ekmool/contracts` | Zod schemas at every request boundary, the response DTOs, the error-code union | web, mobile |
| `@ekmool/tokens` | Colour, type scale, spacing — one source, emitted as both a CSS `@theme` block and a typed object | web, mobile |

### They ship TypeScript source, not compiled output

No `dist/`. No `tsc -b`. Each package's `main`/`exports` point at `.ts`
files, and both consumers compile them:

- **web** — `transpilePackages: ["@ekmool/core", "@ekmool/contracts", "@ekmool/tokens"]`
  in `next.config.ts`
- **mobile** — Metro compiles workspace TypeScript with no configuration
  (SDK 52+ detects the monorepo; SDK 56's on-demand filesystem handles the
  pnpm store)

Three reasons, in order of how much they matter:

1. **Tree-shaking.** A compiled package is a bundler's black box unless
   every side-effect declaration is exactly right. Source in, source out,
   and Turbopack shakes it the way it shakes `src/lib/` today. The script
   budget has 6–12 KB of headroom; a package boundary that defeats
   tree-shaking would eat it in one commit.
2. **No build step in the task graph.** `typecheck` and `lint` fan out;
   nothing has to be built before anything else can run. Turborepo's
   `dependsOn: ["^build"]` becomes a no-op for these three, which is the
   simplest possible thing that works.
3. **One less place for versions to drift.** There is no published artefact,
   so there is no stale artefact.

Every package declares `"sideEffects": false`. None of them has a
side effect — that is enforceable by review, because the whole point of what
goes in here is that it is pure.

### None of them imports React

Stated in the programme index and repeated here because it is the rule most
likely to be broken by a well-meaning refactor: **a shared package that
imports React forces one React version across the monorepo**, and the two
apps are on 19.2.8 and 19.2.3. Expo's own monorepo guide names duplicate
React as the leading cause of "Invalid hook call" in exactly this setup.

`@reduxjs/toolkit` is not React. `createSlice` and the reducer it produces
are framework-agnostic; `react-redux` is the binding and it stays in each
app. So the cart slice can live in `core` with RTK as a **peer dependency**,
and each app supplies its own copy. Add a CI check:

```bash
# fails if any shared package resolves React
! grep -rn "from \"react\"\|from 'react'" packages/*/src
```

Crude, and it will catch the mistake. Something crude that runs beats
something elegant that does not.

---

## `@ekmool/core`

### What moves, and what it costs to move it

| From | To | Notes |
|---|---|---|
| `src/lib/money.ts` | `core/src/money.ts` | 23 lines, no imports. Moves as-is. |
| `src/lib/gst.ts` | `core/src/gst.ts` | 162 lines, pure. Moves as-is. |
| `src/lib/coupons.ts` | `core/src/coupons.ts` | 176 lines, explicitly documented as "pure — no database, no clock, no environment". Moves as-is. |
| `src/lib/serviceability.ts` | `core/src/serviceability.ts` | 265 lines. `DELIVERY_ZONES` is described as the single source of truth for both the checker and `/shipping-policy`; it becomes the source of truth for a third surface. |
| `src/lib/order-status.ts` | `core/src/order-status.ts` | 70 lines. Its own header says it lives outside `src/db` so client components can import it without dragging in `mysql2`. Same reasoning, one level further out. |
| `src/lib/search.ts` | `core/src/search.ts` | 415 lines. **Needs the type extraction below first.** |
| `src/store/cart-slice.ts` | `core/src/cart/slice.ts` | RTK as a peer dependency. |
| `Product`, `ProductVariant`, `ProductImage` from `src/db/queries/products.ts` | `core/src/catalog-types.ts` | See below. |

**The type extraction is the only non-mechanical part.** `src/lib/search.ts`
opens with `import type { Product } from "@/db/queries/products"`. Those
three interfaces are the catalogue's shape, and they are declared in the
file that queries MySQL. They must move to `core`, and
`src/db/queries/products.ts` must then import them back:

```ts
// apps/web/src/db/queries/products.ts
import type { Product, ProductVariant, ProductImage } from "@ekmool/core";
export type { Product, ProductVariant, ProductImage };   // re-exported so
// existing imports across ~30 components keep working unchanged
```

The re-export is deliberate and temporary-looking but should stay. Rewriting
thirty import sites to point at `@ekmool/core` is thirty chances to make a
typo in a phase whose entire claim is "nothing changed", and the query
module is the honest place for a component to learn the catalogue's shape.

**`src/lib/constants.ts` does not move.** It imports `ContentKey` from
`@/content/defaults`, which is the editorial layer, which is web-specific
until Phase 2 decides how copy reaches the phone. Leave it. Moving it now
would drag `src/content/` into a shared package to satisfy one type import.

### The cart slice, and why it is worth the awkwardness

`src/store/cart-slice.ts` plus the localStorage listener in
`cart-persistence.ts` is the web cart. The slice is pure state
transformation — add, remove, set quantity, clear — and the persistence is
a listener middleware writing to `localStorage` under a versioned key.

The slice moves. **The persistence does not**: `localStorage` exists in a
browser and does not exist in React Native. So `core` exports the slice and
a *description* of what to persist, and each app supplies the storage:

```ts
// core/src/cart/persistence.ts
export interface CartStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}
export const CART_STORAGE_KEY = "ekmool.cart.v1";
export function createCartPersistence(storage: CartStorage) { /* … */ }
```

Web passes a `localStorage` adapter; mobile passes `expo-sqlite/kv-store`.
The versioned key is shared, which matters for a reason worth writing in the
comment: it means a future cart-shape migration is written once and both
clients get it.

**Do not try to sync carts between web and phone.** There is no account, so
there is no key to sync them under, and inventing one would be inventing
registration — rule 7. Two devices, two carts, and the customer is not
surprised because they were never told otherwise.

### Where the tests go

The pure arithmetic in `gst.ts` and `coupons.ts` is covered today by
`test:commerce` and `test:promotions`, which drive a live server. Those
suites stay exactly as they are — they test the web app end to end and that
is their job.

Add one new suite, `packages/core/test/run.mjs`, in the house style: a plain
script, `PASS`/`FAIL` lines, non-zero exit, no framework. It asserts the
arithmetic directly, with no server and no database. This is new coverage,
not duplicated coverage: today there is no way to assert
`splitGst(…)` without booting Next and MySQL, and in Phase 4 the phone will
need those numbers to be right without either.

Wire it as `pnpm --filter @ekmool/core test`, and into CI's fast job — the
one that fails in ninety seconds on a typo — because it needs no services.

---

## `@ekmool/contracts`

### What it holds

- `src/lib/validation/checkout.ts` and `validation/account.ts` move here
  verbatim. Zod 4.4.3 is already a dependency; it becomes a dependency of
  this package and a peer of nothing.
- **The response DTOs**, which do not exist anywhere today. Every route
  handler currently builds its JSON inline. `POST /api/checkout` returns
  `{ orderId, status, totalPaise, paymentMethod, razorpayOrderId,
  razorpayKeyId, replayed? }` and nothing declares that. The phone will
  parse it. So it gets a type, and the handler's return is annotated with
  it, so a field renamed on the server fails `typecheck` rather than
  failing on a customer's phone.
- **The error-code union.** Reading the handlers, these exist today:
  `IDEMPOTENCY_KEY_REQUIRED`, `BAD_REQUEST`, `CHALLENGE_FAILED`,
  `VALIDATION_FAILED`, `RAZORPAY_NOT_CONFIGURED`, `COUPON_REFUSED`,
  `INSUFFICIENT_STOCK`, `UNKNOWN_VARIANT`, `DB_UNAVAILABLE`,
  `INTERNAL_ERROR`, `LOOKUP_FAILED`, `RATE_LIMITED`. Collect them into one
  union. The app will switch on them, and a client that switches on string
  literals it inferred from reading the server source is a client that
  breaks quietly.

### What it does not hold

**No copy.** The union is codes; the sentences stay on the server. The
design system's rule — *"Refusals give the reason and the rule: 'That code
needs a basket of at least ₹500', not 'Invalid code'"* — is already
implemented by `couponRefusalMessage(reason, { minSubtotalPaise })`, which
composes the sentence from the rule that refused and its threshold. That
function moves to `core` and both clients call it, so the phone says the
same sentence for the same reason without the sentence being duplicated in
two places to drift.

---

## `@ekmool/tokens`

### The problem being solved

`docs/DESIGN-SYSTEM.md` says the tokens live in `src/app/globals.css` under
Tailwind v4's `@theme`, and that a hardcoded hex in a component is a review
failure. React Native has no CSS. If the phone's palette is typed out by
hand, then `--color-ek-gold-800: #8A5D0D` exists in two files and the day
they differ is the day the accessibility floor quietly breaks on one client
and nobody notices, because the gold trap is specifically the thing that
does not look wrong.

### The shape

`packages/tokens/src/tokens.ts` becomes the single source:

```ts
export const color = {
  paper:     "#FAF7F0",
  cream:     "#F5EFE2",
  green950:  "#10241B",
  green900:  "#1C3A2D",
  green700:  "#2C523F",
  green200:  "#C9D8CD",
  gold800:   "#8A5D0D",   // the only gold that passes 4.5:1 as ink on paper
  gold600:   "#C4881F",
  gold500:   "#D99A2B",
  gold100:   "#F7E8CB",
  terracotta:"#B4572E",
} as const;

export const type = {
  t64: { size: 64, line: … }, t46: …, t34: …, t26: …,
  t20: …, t17: …, t15: …,
} as const;
// Nothing below 15. There is no t13, deliberately — see DESIGN-SYSTEM.md.
```

A script, `packages/tokens/scripts/emit-css.mjs`, writes
`packages/tokens/dist/theme.css` containing the `@theme` block, and
`apps/web/src/app/globals.css` replaces its hand-written token block with
`@import "@ekmool/tokens/theme.css";`.

**The generated CSS is committed**, and CI re-runs the emitter and fails if
the working tree is dirty afterwards. Committing it means the web build has
no code-generation step and Vercel does not need one; the CI check means it
cannot go stale. That combination is worth the small oddity of a generated
file in the tree, and the oddity has to be explained in a comment at the top
of the generated file so nobody edits it by hand.

Line heights are baked into the type tokens on the web and must be baked
into them here too — the design system says *"do not override them"*, and a
React Native `Text` with a size but no `lineHeight` will pick the platform
default and read differently on the two operating systems.

### What tokens are *not*

Spacing beyond the 4px scale, the container widths (`1180px`, `720px`,
`70ch`) and the asymmetric grid ratios are **web layout**, not tokens.
`lg:grid-cols-[1.05fr_0.95fr]` has no meaning on a phone. The phone gets its
own layout grammar in Phase 3, built from the same colours and the same type
scale. Copying `max-w-[1180px]` into a React Native file would be cargo
cult.

---

## Refactoring the web onto the packages

The web app's behaviour must not change. The mechanics:

1. Add the three packages to `apps/web/package.json` as
   `"@ekmool/core": "workspace:*"` etc.
2. `transpilePackages` in `next.config.ts`.
3. Replace each moved module with a re-export shim **only where the import
   is widespread**, and rewrite the import where it is not. `money.ts` is
   imported in dozens of components — shim it. `search.ts` has one or two
   call sites — rewrite them.
4. Delete the moved originals in the same commit. A file that exists in two
   places is a file that will be edited in the wrong one.

### The gate that matters

`pnpm --filter web run audit`, and the numbers are **178 / 181 / 184 / 176 KB**.

A package boundary is exactly the kind of change that can add bytes without
adding code: a barrel `index.ts` that re-exports everything will pull the
whole of `core` into any route that imports `formatPaise`, and Turbopack
will not always shake it back out.

So: **`@ekmool/core` has no barrel export.** Deep paths only —
`@ekmool/core/money`, `@ekmool/core/gst`, `@ekmool/core/search` — declared
in the package's `exports` map. It is slightly less convenient and it is the
difference between a 23-line import and a 900-line one.

If the audit total moves, follow `docs/PERFORMANCE.md`: compare the chunk
*list*, not the total. A new filename in the list is the regression. The
total alone is noisy by about 9 KB and has already fooled this project once.

---

## Exit criteria

- [ ] `pnpm turbo typecheck lint` clean across all five workspaces
- [ ] `pnpm --filter @ekmool/core test` green, and running in CI's fast job
- [ ] The full web suite matrix from Phase 0 green, sequentially
- [ ] `pnpm --filter web run audit`: SEO 100, a11y 100, and the four script
      totals within noise of 178 / 181 / 184 / 176 KB, **verified by chunk
      list, not by total**
- [ ] No shared package resolves `react` — the grep check is in CI
- [ ] No barrel export in `@ekmool/core`; `exports` map lists each entry
      point
- [ ] `packages/tokens/dist/theme.css` regenerates to a clean tree in CI
- [ ] `globals.css` contains no hand-written token values
- [ ] Every moved file deleted from its old location in the same commit that
      created its new one
- [ ] `docs/DESIGN-SYSTEM.md` updated to say the tokens' source is now
      `packages/tokens/src/tokens.ts` and `globals.css` imports them
- [ ] `docs/ARCHITECTURE.md`'s module-boundary section updated with
      `packages/`

---

## Related

[Programme index](README.md) · [← Phase 0](phase-0-monorepo.md) ·
[Phase 2 →](phase-2-mobile-api.md) ·
[`docs/DESIGN-SYSTEM.md`](../DESIGN-SYSTEM.md) ·
[`docs/PERFORMANCE.md`](../PERFORMANCE.md)
