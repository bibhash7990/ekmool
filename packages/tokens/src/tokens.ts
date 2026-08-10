/**
 * EKMOOL design tokens — the single source.
 *
 * `apps/web/src/app/globals.css` used to hold these values by hand inside
 * Tailwind v4's `@theme` block. React Native has no CSS, so a phone client
 * cannot read that block; typing the palette out a second time is what
 * `packages/tokens` exists to prevent. The failure it prevents is specific:
 * `--color-ek-gold-800: #8a5d0d` living in two files means the day they
 * diverge is the day the 4.5:1 contrast floor breaks on one client and
 * nobody notices, because the gold trap is the mistake that does not look
 * wrong. One source, two outputs — this file, and `dist/theme.css`
 * generated from it by `pnpm --filter @ekmool/tokens emit`.
 *
 * This module is data. It imports nothing — not React, not a helper, not a
 * colour library. A shared package that resolves React forces one React
 * version across the monorepo, and the two apps are not on the same one.
 *
 * What is deliberately NOT here: the page container widths (1180px, 720px),
 * the prose measure (70ch) and the asymmetric grid ratios
 * (`lg:grid-cols-[1.05fr_0.95fr]`). Those are web layout, not tokens.
 * `1.05fr 0.95fr` has no meaning on a phone; copying it across would be
 * cargo cult. The phone gets its own layout grammar built from these same
 * colours and this same type scale.
 *
 * Also not here: `--font-display` / `--font-sans`. Those stacks resolve
 * `var(--font-marcellus)` and `var(--font-figtree)`, which `next/font`
 * defines at build time inside the web app. Outside that app the variables
 * do not exist, so shipping the stacks from a shared package would ship a
 * dangling reference. They stay in `globals.css`.
 */

/**
 * The eleven brand colours, in the order they appear in the emitted CSS.
 *
 * Lowercase hex, matching what `globals.css` has always had. (Note that
 * `docs/DESIGN-SYSTEM.md`'s table writes them uppercase. CSS does not care,
 * and neither does React Native; lowercase wins here only because it is
 * what the generated stylesheet has to reproduce byte for byte.)
 */
export const color = {
  green950: "#10241b", // deepest — dark section backgrounds
  green900: "#1c3a2d", // PRIMARY INK — headings, header/footer, buttons
  green700: "#2c523f", // hover states, secondary text on light
  green200: "#c9d8cd", // borders, dividers on light

  /*
   * Gold that is safe as INK, measured against every light surface we use:
   * 4.75:1 on gold-100, 5.02:1 on cream, 5.38:1 on paper. gold-600 was
   * assumed readable and is not — it lands at 2.84:1 on paper, under even
   * the 3:1 large-text floor. Use gold-800 for any gold text or icon on a
   * light ground; keep 500/600 for fills, rules and use on dark green.
   */
  gold800: "#8a5d0d",
  gold600: "#c4881f", // gold fills, hover fills, rules — not ink on light
  gold500: "#d99a2b", // TURMERIC GOLD — CTAs, accents, the root motif
  gold100: "#f7e8cb", // gold tint backgrounds, badges

  cream: "#f5efe2", // ink on dark backgrounds
  paper: "#faf7f0", // page background — never pure white
  terracotta: "#b4572e", // chilli product accent only
} as const;

/**
 * The type scale: 15 / 17 / 20 / 26 / 34 / 46 / 64.
 *
 * **Nothing below 15 exists, deliberately.** There is no `t13`. If a label
 * needs to be smaller than 15px to fit, the layout is wrong — adding the
 * token is how that gets papered over, so the token is not offered.
 *
 * `size` is in **px**, because px is the unit both consumers can start
 * from: 1rem = 16px, so the CSS emitter divides by 16 (all seven divide
 * exactly — 16 is a power of two, so there is no rounding to argue about),
 * and React Native's `fontSize` takes the number as it stands.
 *
 * `lineHeight` is the **unitless multiplier** CSS wants. The design system
 * says line heights are baked into the tokens and must not be overridden,
 * and that has to hold on both clients: a React Native `<Text>` given a
 * size but no `lineHeight` picks a per-platform default, so the same screen
 * reads differently on iOS and Android. RN needs an absolute value, so
 * multiply — `lineHeight: type.t17.size * type.t17.lineHeight` — rather
 * than leaving it off.
 */
export const type = {
  t15: { size: 15, lineHeight: 1.55 }, // secondary, captions, form labels
  t17: { size: 17, lineHeight: 1.6 }, // body
  t20: { size: 20, lineHeight: 1.5 }, // lead paragraphs
  t26: { size: 26, lineHeight: 1.35 }, // card titles, subheads
  t34: { size: 34, lineHeight: 1.22 }, // section heads
  t46: { size: 46, lineHeight: 1.12 }, // page H1, major section heads
  t64: { size: 64, lineHeight: 1.05 }, // home hero only
} as const;

/**
 * The two shadows. Nothing heavier than these exists.
 *
 * Stored as layers rather than as a CSS string so the phone can use them:
 * React Native takes `shadowOffset`, `shadowRadius` and `shadowOpacity` as
 * numbers and cannot parse `0 8px 24px rgb(…)`. The emitter composes the
 * CSS string from these fields.
 *
 * `color` names a key of `color` above rather than repeating a hex — the
 * shadow tint is green-950, and if the palette ever moves the shadow moves
 * with it instead of quietly staying behind.
 */
export const shadow = {
  hairline: [{ x: 0, y: 1, blur: 2, color: "green950", alpha: 0.06 }],
  card: [
    { x: 0, y: 1, blur: 2, color: "green950", alpha: 0.05 },
    { x: 0, y: 8, blur: 24, color: "green950", alpha: 0.07 },
  ],
} as const satisfies Record<
  string,
  ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly blur: number;
    readonly color: keyof typeof color;
    readonly alpha: number;
  }>
>;

/**
 * Easing, as the four control points of a cubic Bézier.
 *
 * The same four numbers drive `cubic-bezier(…)` in CSS and
 * `Easing.bezier(…)` in React Native Reanimated, so this is one of the few
 * motion values that genuinely crosses. Durations do not: they live at each
 * call site, in a `transition` on the web and in a timing config on the
 * phone, and inventing a `--duration-*` token to hold numbers neither
 * client currently reads from a token would be inventing a token.
 */
export const ease = {
  soft: [0.22, 1, 0.36, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;
