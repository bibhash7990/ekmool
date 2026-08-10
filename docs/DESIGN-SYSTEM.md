# Design system

Editorial, not e-commerce-template. The site should read like a good food
magazine that happens to sell things — generous type, a lot of paper, one
accent used sparingly, and photography that looks like somebody stood in a
field.

Everything below is a token in **`packages/tokens/src/tokens.ts`**, which is
the single source. A script emits `packages/tokens/dist/theme.css` — the
Tailwind v4 `@theme` block that `apps/web/src/app/globals.css` imports — and
the same object is read directly by React Native, which has no CSS.

**A hardcoded hex in a component is a review failure**, on either client.

One source because two would drift, and the drift is invisible: the gold
trap below is specifically the mistake that does not look wrong. After
changing a token run `pnpm --filter @ekmool/tokens emit`; CI runs the same
script with `--check` and fails if the committed CSS is stale.

---

## Colour

| Token | Value | Use |
|---|---|---|
| `--color-ek-paper` | `#FAF7F0` | Page background. **Never pure white.** |
| `--color-ek-cream` | `#F5EFE2` | Ink on dark; card grounds on light |
| `--color-ek-green-950` | `#10241B` | Dark section backgrounds |
| `--color-ek-green-900` | `#1C3A2D` | **Primary ink** — headings, header, footer, buttons |
| `--color-ek-green-700` | `#2C523F` | Body text, hover states |
| `--color-ek-green-200` | `#C9D8CD` | Borders, dividers |
| `--color-ek-gold-800` | `#8A5D0D` | **The only gold safe as ink on light** |
| `--color-ek-gold-600` | `#C4881F` | Fills, rules, hover fills |
| `--color-ek-gold-500` | `#D99A2B` | Turmeric gold — CTAs, accents, the root motif |
| `--color-ek-gold-100` | `#F7E8CB` | Tint backgrounds, badges |
| `--color-ek-terracotta` | `#B4572E` | Chilli accent, and error text |

Utilities: `bg-ek-paper`, `text-ek-green-900`, `border-ek-green-200`.

**The gold trap.** `gold-500` and `gold-600` do not pass 4.5:1 on paper.
Text uses `gold-800`. Gold as a *fill* — a button, a rule, a badge — is
fine at any weight. This single mistake is the most likely way to drop the
accessibility score from 100.

Accent per product family: turmeric `gold`, makhana `green`, chilli
`terracotta`. Set on the product row, not chosen in a component.

---

## Type

Two families. Display is **Marcellus, weight 400 only** — hierarchy comes
from size, letter-spacing and case, never from synthesised weight. Body is
**Figtree** at 400/500/600. Both self-hosted by `next/font`, so there is no
remote font origin and no layout shift.

| Token | Size | For |
|---|---|---|
| `text-64` | 4rem | Home hero only |
| `text-46` | 2.875rem | Page H1, major section heads |
| `text-34` | 2.125rem | Section heads |
| `text-26` | 1.625rem | Card titles, subheads |
| `text-20` | 1.25rem | Lead paragraphs |
| `text-17` | 1.0625rem | Body |
| `text-15` | 0.9375rem | Secondary, captions, form labels |

Line heights are baked into the tokens. Do not override them.

Nothing below `text-15`. There is no `text-13`, deliberately — if a label
needs to be smaller than 15px to fit, the layout is wrong.

`.eyebrow` is the small-caps tracked label above a heading: uppercase,
`0.18em` tracking, `text-15`. Use `<Eyebrow>`; when it is the section's
heading, `<Eyebrow as="h2">`.

Measure: **prose never exceeds `max-w-[70ch]`**, and body copy usually sits
at `52–68ch`. Wide text is the fastest way to make a page feel cheap.

---

## Space and rhythm

Tailwind's 4px scale. Section padding follows one pattern:

```
py-16 lg:py-24     standard section
py-20 lg:py-28     a section that should breathe (hero, closing CTA)
```

Page container: `mx-auto max-w-[1180px] px-5 lg:px-8`. Long-form pages narrow
to `max-w-[720px]`.

**Asymmetry is the house style.** Two-column sections use
`lg:grid-cols-[1.05fr_0.95fr]` or `[1.15fr_0.85fr]`, not `1fr 1fr`. A
perfectly even split reads as a template.

`<SoilLine />` separates major sections — a hand-drawn horizon rule, not a
`<hr>`. Use it between sections, never inside one. Once per page: it is a
signature, and a signature repeated eight times is wallpaper.

**A long page alternates its field.** With eleven sections the home page
cannot rely on whitespace alone — four `bg-ek-paper` sections in a row read
as one very long section. The rhythm is:

| Field | Used for |
|---|---|
| `bg-ek-paper` (default) | editorial sections — origins, process, the GI explainer, the journal |
| `bg-ek-cream` + `border-y border-ek-green-200` | commerce and utility — the shelf, delivery and payment |
| `grain-dark bg-ek-green-950` | exactly one band per page, the argument the brand is making |

Never two cream sections adjacent, and check the rhythm still holds with
**conditional sections absent** — the home page's review section renders
nothing until a real review exists, and a page that only looks right when
it is present is a page that looks wrong on launch day.

---

## Components

`apps/web/src/components/ui/` is the primitive layer. Reach for it before
writing a div.

| Component | Notes |
|---|---|
| `Button` / `ButtonLink` | `size="lg"` for primary CTAs. Never a bare styled `<a>` |
| `Eyebrow` | Section labels. `as="h2"` when it is the heading |
| `SoilLine` | Section divider |
| `Reveal` | Scroll-in, honours `prefers-reduced-motion` |
| `PhotoPlaceholder` | Typed art-direction stand-in — see below |
| `GIChip` | The GI-tag badge |
| `Breadcrumbs` | Every page below the top level |

### PhotoPlaceholder

There is no stock photography in this project, on purpose. Every image slot
renders a toned placeholder carrying the **art direction** for the shot that
belongs there:

```tsx
<PhotoPlaceholder
  ratio="4 / 5"
  tone="gold"
  direction="Overhead: loose turmeric mounded on raw jute, brass measuring
             cup half-buried. Hard warm side light, deep shadow, no props
             from outside the region."
/>
```

When a real photograph arrives it replaces the placeholder and the direction
becomes its alt text. Filling these with generic stock would make the site
look like every other spice shop, which is the one thing it must not.

**Photography rules** for whoever shoots them: daylight or one hard source,
never a ring light; surfaces from the region — jute, stone, brass, weathered
wood; no imported props; the product filling the frame; shadows kept.

---

## Motion

150–300ms, and it must mean something. Colour and opacity transitions only —
never `width`, `height`, `top` or `left`, which force layout on every frame.

`Reveal` handles scroll-in. Every animation respects
`prefers-reduced-motion: reduce`; there is a global rule in `globals.css`
and new animation must not escape it.

Hover is never the only way to reach anything. Touch has no hover.

---

## Accessibility — non-negotiable

The audit gate is **100**, not 95. It has caught real defects and it stays
where it is.

- Contrast **4.5:1** on body text, 3:1 on large. `gold-800` is the only gold
  that qualifies as ink.
- **Never remove a focus ring.** Restyle it if it is ugly.
- Touch targets **44×44 minimum** — `min-h-11` on every button, link-button
  and input. This is why form controls look slightly larger than a designer
  might draw them.
- Every input has a **visible** `<label>`. A placeholder is not a label; it
  disappears exactly when the user needs it.
- Errors sit **next to the field**, not only in a summary at the top.
- One `<h1>` per page. Heading levels do not skip.
- Icon-only buttons carry `aria-label`. Status messages carry `role="status"`.
- Decorative SVG gets `aria-hidden="true"`.
- Every interactive flow must work with a keyboard. Drag-to-reorder in the
  admin has ↑/↓ buttons for exactly this reason — native HTML5 drag is
  mouse-only and invisible to a screen reader.

---

## Copy

The voice is plain, specific and unhurried. It names things.

- **Never fabricate social proof.** No seeded reviews, no invented ratings,
  no "3 left!" unless the stock number is literally 3. A product nobody has
  reviewed shows no rating at all — not a zero. The same rule applies to
  the *shape* of proof: the home page's review section returns `null` when
  there is nothing to show, rather than rendering a heading over a row of
  grey stars. `test:home` asserts both directions.
- **State the limits of your own credential.** The GI explainer on the home
  page has a "what it does not tell you" column — that the tag is not an
  organic certificate, not a grade, and not a health claim. A shop that
  will say that about its own badge is easier to believe about everything
  else, and every word of it is true.
- **Say what happens next.** "Waiting to be sent" beats "Thank you for your
  order" when the order has not been sent.
- **Refusals give the reason and the rule.** "That code needs a basket of at
  least ₹500", not "Invalid code".
- No exclamation marks. No "Oops!". No "Awesome!".
- Indian English, Indian formats: ₹ with `en-IN` grouping, `en-IN` dates,
  IST everywhere.
- FSSAI-safe: no disease, cure or treatment claims, anywhere, ever.

---

## Adding a page

1. Container `mx-auto max-w-[1180px] px-5 lg:px-8`, or `720px` for prose.
2. `<Breadcrumbs>` unless it is top-level.
3. One `<h1>`, in `font-display`.
4. `<Eyebrow>` above each section heading.
5. `<SoilLine>` between major sections.
6. Tokens only — no hex, no arbitrary `text-[13px]`.
7. Server component unless it genuinely needs the browser.
8. `export const metadata` with a title and description; `robots: { index:
   false }` on anything private.
9. Run `pnpm --filter web run audit` and `pnpm --filter web validate:schema`
   before opening the PR.

---

## Related

`packages/tokens/src/tokens.ts` is the source of truth for colour and type;
`apps/web/src/app/globals.css` imports the emitted `@theme` and owns
everything else — the base layer, the utilities, the font stacks (which
resolve `next/font` variables and so cannot leave the app).
`docs/PERFORMANCE.md` for what a client component costs ·
`docs/ARCHITECTURE.md` for the server/client boundary ·
`docs/mobile/phase-1-shared-packages.md` for why the tokens moved
