/**
 * The React Native view of `@ekmool/tokens`.
 *
 * `packages/tokens/src/tokens.ts` is the single source of colour and type
 * for both clients. The web reads it through a generated Tailwind `@theme`
 * block; React Native has no CSS, so it reads the object directly — this
 * module is the adapter, and it is the ONLY place in `apps/mobile/` where a
 * colour value may originate. A hex literal anywhere else in the app is a
 * review failure on the web (docs/DESIGN-SYSTEM.md) and a CI grep failure
 * here.
 *
 * Nothing below invents a value. Everything is computed from the imported
 * tokens, so `pnpm --filter @ekmool/tokens emit` moving a colour moves the
 * phone with it. Where CSS and React Native genuinely disagree about units,
 * the conversion happens once, here, with the reason written down.
 */

import {
  color,
  ease,
  shadow as shadowLayers,
  type as cssType,
} from "@ekmool/tokens";
import type { BoxShadowValue } from "react-native";

/* ------------------------------------------------------------------ colour */

/**
 * The eleven brand colours, straight through — the token keys already read
 * as React Native property values (`backgroundColor: color.paper`), so
 * renaming them would only create a second vocabulary to keep in sync.
 *
 * **The gold trap applies here exactly as it does on the web.** `gold800` is
 * the only gold that clears 4.5:1 as ink on a light ground (4.75:1 on
 * gold-100, 5.02:1 on cream, 5.38:1 on paper — measured in the token file).
 * `gold500` and `gold600` are fills, rules and badges only; `gold600` lands
 * at 2.84:1 on paper, under even the 3:1 large-text floor. This is the
 * mistake that does not look wrong, which is why it is repeated here rather
 * than left in one file.
 */
export { color, ease };

/**
 * `#rrggbb` plus an alpha channel, as an `rgba()` string React Native can
 * parse. The hex is read out of the token at runtime rather than a second
 * eight-digit `#rrggbbaa` constant being written down, because an
 * eight-digit constant is a copy of a token that no grep can trace back to
 * its source.
 */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * The `color-mix(in srgb, a <ratio>, b)` the web's PhotoPlaceholder uses,
 * reproduced arithmetically.
 *
 * `color-mix()` in the sRGB space with two opaque colours is a plain
 * per-channel weighted average, so this produces the same eight-bit result
 * the browser does — the two clients render the same tone rather than
 * approximately the same tone. React Native has no `color-mix`, and the
 * alternative (writing the three mixed hexes down) would put three colours
 * in the codebase that no token owns.
 *
 * @param ratio share of `a` in the mix, 0 to 1 — `14%` in CSS is `0.14`.
 */
export function mix(a: string, b: string, ratio: number): string {
  const x = Number.parseInt(a.slice(1), 16);
  const y = Number.parseInt(b.slice(1), 16);
  const channel = (shift: number): number =>
    Math.round(((x >> shift) & 255) * ratio + ((y >> shift) & 255) * (1 - ratio));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/* -------------------------------------------------------------------- type */

export type TextScale = {
  readonly fontSize: number;
  readonly lineHeight: number;
};

/**
 * The token's `lineHeight` is the **unitless CSS multiplier** (1.55, 1.6,
 * 1.5, 1.35, 1.22, 1.12, 1.05) — not a rem string, not points. Checked in
 * `packages/tokens/src/tokens.ts`, which states it explicitly and tells this
 * consumer to multiply. React Native's `lineHeight` is absolute points, so
 * the multiplication happens once here and never at a call site.
 *
 * Rounded to whole points deliberately, so the number is the same wherever
 * it is read. React Native's two text engines do not resolve a fractional
 * line height onto the pixel grid identically — Android's line-height span
 * works in whole pixels, iOS keeps the fraction — and half a point per line
 * compounds down a paragraph into a visibly different block height on the
 * two platforms from one token. The largest correction is 0.52pt (t46:
 * 46 x 1.12 = 51.52 -> 52); t20 needs none (20 x 1.5 = 30).
 *
 * The token file's other rule holds unchanged: a `<Text>` given a size but
 * no `lineHeight` picks a per-platform default. Always spread a scale entry,
 * never just its `fontSize`.
 */
function points(token: { readonly size: number; readonly lineHeight: number }): TextScale {
  return {
    fontSize: token.size,
    lineHeight: Math.round(token.size * token.lineHeight),
  };
}

export const type: Readonly<Record<keyof typeof cssType, TextScale>> = {
  t15: points(cssType.t15), // secondary, captions, form labels
  t17: points(cssType.t17), // body
  t20: points(cssType.t20), // lead paragraphs
  t26: points(cssType.t26), // card titles, subheads
  t34: points(cssType.t34), // section heads
  t46: points(cssType.t46), // screen title
  t64: points(cssType.t64), // hero only
};

/**
 * Letter-spacing, in **em**, to be multiplied by the font size at the call
 * site.
 *
 * CSS takes `0.18em` and scales it with the type. React Native takes
 * absolute points, so `letterSpacing: 0.18` would be a hair of tracking on a
 * 15pt label rather than the 2.7pt the design system draws. There is no way
 * to store the resolved number here without also storing which size it
 * belongs to, so the em value is what is stored and `type.t15.fontSize *
 * tracking.eyebrow` is what a component writes.
 */
export const tracking = {
  /** `.eyebrow` in globals.css: uppercase, 0.18em, text-15. */
  eyebrow: 0.18,
} as const;

/**
 * Font families as React Native resolves them.
 *
 * These are **file base names**, and that is not an assumption — the four
 * TTFs in `assets/fonts/` were read for their `name` table before this was
 * written, because getting it wrong renders the entire app in the system
 * font and nobody notices until a screenshot:
 *
 * | file                  | PostScript name (6) | family (1)        |
 * |-----------------------|---------------------|-------------------|
 * | Marcellus-Regular.ttf | Marcellus-Regular   | Marcellus         |
 * | Figtree-Regular.ttf   | Figtree-Regular     | Figtree           |
 * | Figtree-Medium.ttf    | Figtree-Medium      | Figtree Medium    |
 * | Figtree-SemiBold.ttf  | Figtree-SemiBold    | Figtree SemiBold  |
 *
 * Android resolves a family by the asset file name that `expo-font` embeds
 * (`assets/fonts/Figtree-Medium.ttf` -> `"Figtree-Medium"`). iOS resolves by
 * the font's internal PostScript name. Here the two columns are identical
 * for all four files, so **no `Platform.select` is needed** — one string
 * works on both. If a fifth face is ever added whose PostScript name does
 * not match its file name, this is where the split goes.
 *
 * **The trap is `"Marcellus"` and `"Figtree"`** — the bare family names,
 * which are the obvious guess. On iOS they work: family(1) really is
 * "Marcellus", so UIKit finds the face. On Android they do not, because
 * there is no `fonts/Marcellus.ttf` to find, and the text silently falls
 * back to Roboto. That is a defect that looks perfect on the simulator the
 * developer is using and wrong on the mid-range Android phone in
 * `docs/PERFORMANCE.md` — which is why the names below are the ones that
 * resolve on both, and why nothing outside this module should type a font
 * name at all.
 *
 * `"Figtree Medium"` and `"Figtree SemiBold"` are worse again: they are the
 * family(1) names of those two files, so they would work on iOS and fail on
 * Android in exactly the same asymmetric way.
 *
 * There is no `fontWeight` anywhere in this app. Marcellus is 400 only —
 * the design system is explicit that display hierarchy comes from size,
 * letter-spacing and case, never from synthesised weight — and Figtree's
 * three weights are three separate registered families, so asking for
 * `fontWeight: "600"` on `Figtree-Regular` gets a faux-bold smear rather
 * than Figtree SemiBold. Name the face.
 */
export const font = {
  display: "Marcellus-Regular",
  body: "Figtree-Regular",
  bodyMedium: "Figtree-Medium",
  bodySemiBold: "Figtree-SemiBold",
} as const;

/* ------------------------------------------------------------------- space */

/**
 * Tailwind's 4px scale, keyed by the step so a web class translates without
 * arithmetic: `px-5` is `space.x5`, `gap-1.5` is `space.x1_5`. Only the
 * steps the design system actually uses are here; adding the rest
 * pre-emptively would turn a translation table into a general-purpose
 * spacing library nobody agreed to.
 *
 * `x11` (44) is the touch-target floor from rule 11 and is named as a step
 * rather than as `touchTarget` because that is what `min-h-11` means on the
 * web, and the two numbers must never drift apart.
 */
export const space = {
  x1: 4,
  x1_5: 6,
  x2: 8,
  x2_5: 10,
  x3: 12,
  x3_5: 14,
  x4: 16,
  x5: 20, // the page gutter — the web's `px-5`
  x6: 24,
  x7: 28,
  x8: 32,
  x10: 40,
  x11: 44, // minimum touch target
  x12: 48,
  x13: 52,
  x14: 56,
  x16: 64,
} as const;

/**
 * Corner radii. Tailwind v4's `rounded-sm` is 0.25rem, and 1rem is 16px, so
 * the 4pt the web's Button and GIChip draw is `radius.sm`. `full` is a large
 * finite number rather than `9999` for no reason beyond it being enough for
 * any control on a phone.
 */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  full: 999,
} as const;

/**
 * The width of a rule or a border, in points.
 *
 * **Not `StyleSheet.hairlineWidth`**, which is the obvious choice and the
 * wrong one. `hairlineWidth` is one *device* pixel — 0.33pt on a 3x screen —
 * whereas the web's `h-px` and `border` are one CSS pixel, which is one RN
 * point. Using `hairlineWidth` would draw the divider three times finer on
 * the phone than the same divider on the web, from the same design. If a
 * true one-device-pixel rule is ever wanted, that is a new constant with its
 * own reason, not a redefinition of this one.
 */
export const hairline = 1;

/* ------------------------------------------------------------------ shadow */

/**
 * The two shadows, as React Native `boxShadow` layer arrays.
 *
 * `boxShadow` (RN 0.76+, New Architecture, and we are on 0.86 with
 * `newArchEnabled: true`) is the only form that can carry both of `card`'s
 * layers on both platforms. The legacy `shadowOffset`/`shadowRadius`/
 * `elevation` triple was rejected: it renders one layer on iOS and, on
 * Android, `elevation` is a single number that cannot express two offsets at
 * two opacities, so the card would have come out as a different shadow per
 * platform from a token that says it is one shadow.
 *
 * The tint is read from `color[layer.color]` — the token stores the palette
 * key, not a hex, precisely so the shadow follows the palette.
 */
function toBoxShadow(
  layers: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly blur: number;
    readonly color: keyof typeof color;
    readonly alpha: number;
  }>,
): readonly BoxShadowValue[] {
  return layers.map((layer) => ({
    offsetX: layer.x,
    offsetY: layer.y,
    blurRadius: layer.blur,
    color: withAlpha(color[layer.color], layer.alpha),
  }));
}

export const shadow: Readonly<
  Record<keyof typeof shadowLayers, readonly BoxShadowValue[]>
> = {
  hairline: toBoxShadow(shadowLayers.hairline),
  card: toBoxShadow(shadowLayers.card),
};

/* ------------------------------------------------------------------ motion */

/**
 * The design system's motion budget, restated as numbers so a component does
 * not have to go and read the prose: 150-300ms, colour and opacity only.
 *
 * Anything using these must also check
 * `AccessibilityInfo.isReduceMotionEnabled()`. The web has one global
 * `prefers-reduced-motion` rule in `globals.css` that no animation can
 * escape; React Native has no equivalent, so the check is per component and
 * it will be forgotten unless it is a review item. It is a review item.
 */
export const duration = {
  /** Press feedback, state colour changes. */
  fast: 150,
  /** The upper bound. Nothing in this app is slower. */
  slow: 300,
} as const;
