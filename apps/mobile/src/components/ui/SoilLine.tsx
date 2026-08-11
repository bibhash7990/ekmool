import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { color, hairline, radius } from "@/theme";

/**
 * THE signature element: a hairline rule broken by a gold taproot that drops
 * below it. Once between major sections, never decoratively — a signature
 * repeated eight times is wallpaper.
 *
 * ---------------------------------------------------------------------------
 * ## The decision: composed Views. Not SVG, not a pre-rendered asset.
 *
 * The web draws this as an inline `<svg>` with two paths. Neither of the two
 * obvious ports is right.
 *
 * **Rejected: `react-native-svg`.** Rule 12 — ask before adding a dependency,
 * and exactly one has been added since v1.0.0. This is a native module added
 * to every build, on both platforms, so that one decorative rule can draw a
 * Bézier. It is not installed and this component does not ask for it.
 *
 * **Rejected: a pre-rendered WebP at 3x**, which is what
 * `docs/mobile/phase-3-app-foundation.md` §4 suggests. Two reasons it is
 * worse here than it looks on paper:
 *
 *   1. It bakes gold-500 into pixels. The entire argument for
 *      `packages/tokens` is that a colour lives in one place, and CI enforces
 *      it with a grep for hex literals — a grep an image file cannot fail.
 *      Move `gold500` and this rule silently keeps the old gold, on the one
 *      element the brand signs its pages with.
 *   2. The rule is full-bleed and the device width is not known at build
 *      time. A raster either stretches — turning a 1pt hairline into a
 *      blurred two-pixel smear at every width that is not an exact multiple —
 *      or needs a nine-patch, at which point it is three density variants and
 *      a slicing convention to avoid two Views.
 *
 * **Chosen: three Views.** No asset, no bytes, no native module; the colour
 * comes from the token, the rule is crisp at any width and any density, and
 * it costs nothing to delete.
 *
 * What is lost, stated rather than glossed: the web's taproot is a Bézier
 * that tapers to a point at both ends (path `M12 0 C12.4 8, 12.8 15, 12 24`,
 * about 1.6 units wide at its waist, zero at the tips). A View can only
 * approximate that with a rounded 2pt bar, so the tip is blunt where the web
 * is sharp — a difference of under a point, on a 24pt mark.
 *
 * **Reversal condition:** if Phase 4 turns up a second and a third genuine
 * need for vector drawing — a chart, an illustrated empty state, an icon set
 * that is not the platform's — take `react-native-svg` then and port the two
 * paths from `apps/web/src/components/ui/SoilLine.tsx` verbatim. One
 * decorative rule is not a reason; three real ones are.
 * ---------------------------------------------------------------------------
 */

export type SoilLineProps = {
  /** Where the root breaks through the line. */
  align?: "left" | "center";
  /** Margins and width live here — the design system uses `max-w-sm` etc. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The web's SVG viewBox is 24 x 26 and the geometry below is in those exact
 * units, so the two files can be diffed against each other. Read the numbers
 * next to the paths in `apps/web/src/components/ui/SoilLine.tsx`.
 */
const MARK_WIDTH = 24;
const MARK_HEIGHT = 26;

export function SoilLine({ align = "center", style }: SoilLineProps) {
  return (
    <View
      // Decorative. The web sets role="presentation" aria-hidden="true"; the
      // React Native equivalent needs both props, because iOS reads
      // accessibilityElementsHidden and Android reads
      // importantForAccessibility and neither honours the other.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.container, style]}
    >
      <View style={styles.rule} />
      <View style={[styles.mark, align === "center" ? styles.center : styles.left]}>
        <View style={styles.taproot} />
        <View style={styles.sideRoot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    // An explicit height rather than letting the mark overflow the rule the
    // way the web's absolutely-positioned <svg> does. Android clips children
    // that fall outside their parent's bounds in several layout paths, and a
    // signature element that disappears on one platform is not worth the
    // saved line.
    height: MARK_HEIGHT,
  },
  rule: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: hairline,
    backgroundColor: color.green200,
  },
  mark: {
    position: "absolute",
    top: 0,
    width: MARK_WIDTH,
    height: MARK_HEIGHT,
  },
  left: {
    left: 0,
  },
  center: {
    left: "50%",
    marginLeft: -MARK_WIDTH / 2,
  },

  // The taproot: `M12 0 … 24` — from the rule down to y=24, centred on x=12.
  // 2pt wide with a full radius, which rounds both tips; the web's path
  // tapers to a point instead. See the header comment.
  taproot: {
    position: "absolute",
    left: 11,
    top: 0,
    width: 2,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: color.gold500,
  },
  // The side root: the web strokes (11.4, 12) to (7.6, 16.6) at width 1.1.
  // That segment is 6 long and leans 40 degrees off vertical, and its
  // midpoint is (9.5, 14.3). React Native rotates about a View's centre, so
  // the position below places the centre there: left = 9.5 - 1.1/2,
  // top = 14.3 - 6/2.
  sideRoot: {
    position: "absolute",
    left: 8.95,
    top: 11.3,
    width: 1.1,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: color.gold500,
    transform: [{ rotate: "40deg" }],
  },
});
