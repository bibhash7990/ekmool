/**
 * The primitive layer, in one import.
 *
 * A barrel — which `@ekmool/core` is forbidden from having, and
 * `scripts/check-shared-packages.mjs` fails the build over. The two cases
 * are genuinely different and the distinction is worth stating, because the
 * next person will read that check and wonder why this file is allowed:
 *
 * A barrel in a **shared package** lets `import { formatPaise }` pull the
 * whole package into any web route that touches money, and Turbopack does
 * not always shake it back out — the web's script budget has single-digit
 * KB of headroom, so that is not a risk worth taking for an import
 * shortcut.
 *
 * A barrel in **this app** costs nothing measurable. Metro produces one
 * bundle for the whole application rather than a chunk per route, so there
 * is no per-screen payload for an unused export to inflate; and every
 * component below is used by at least one screen anyway, so there is nothing
 * unused to shake. What it buys is that a screen's import block reads as one
 * line naming the design system rather than seven lines naming files.
 *
 * If that ever stops being true — if the app grows lazy-loaded routes, or a
 * primitive arrives that pulls in something heavy — this file is the thing
 * to delete, and the screens go back to per-file imports like the web's.
 */
export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

export { Eyebrow } from "./Eyebrow";
export type { EyebrowProps, EyebrowTone } from "./Eyebrow";

export { GIChip } from "./GIChip";
export type { GIChipProps } from "./GIChip";

export { PhotoPlaceholder } from "./PhotoPlaceholder";
export type { PhotoPlaceholderProps, PhotoTone } from "./PhotoPlaceholder";

export { Price } from "./Price";
export type { PriceProps, PriceTone } from "./Price";

export { edgesUnderHeader, Screen } from "./Screen";
export type { ScreenProps } from "./Screen";

export { SoilLine } from "./SoilLine";
export type { SoilLineProps } from "./SoilLine";
