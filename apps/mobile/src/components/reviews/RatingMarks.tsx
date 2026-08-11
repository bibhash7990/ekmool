import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { color, radius, space } from "@/theme";

/**
 * Five marks, filled to the nearest whole one.
 *
 * ---------------------------------------------------------------------------
 * ## Why these are rules and not stars
 *
 * The web draws `Stars` as an inline SVG with five star paths
 * (`apps/web/src/components/product/Stars.tsx`). Neither obvious port works:
 *
 * **Rejected: `react-native-svg`.** Rule 12 — one dependency has been added
 * since v1.0.0 and it was approved first. `SoilLine` refused the same native
 * module for the same reason and wrote up the same reversal condition: if
 * Phase 5 turns up a chart, an illustrated empty state and an icon set, take
 * it then and port the paths verbatim. One rating row is not a reason.
 *
 * **Rejected: the `★` / `☆` glyphs.** U+2605 is not in Figtree, so it falls
 * back to whatever the platform has. On Android that is Roboto or, on some
 * OEM builds, the colour-emoji font — a rating row that is flat gold on one
 * handset and a cartoon star on the next, with different metrics either way.
 * It also breaks the rule that no component outside `src/theme` decides a
 * colour, because an emoji font carries its own.
 *
 * **Chosen: five short rounded rules**, composed from Views. No asset, no
 * bytes, no native module, crisp at any density, and the colour comes from
 * the token so `pnpm --filter @ekmool/tokens emit` moves it. It is also the
 * house motif rather than a borrowed one: this design system draws rules and
 * roots — the accent rule on a product card is `height: 3`, `SoilLine` is a
 * hairline and a taproot — and a row of five gold rules reads as the same
 * hand. A five-pointed star does not appear anywhere else in the brand.
 *
 * What is lost, stated rather than glossed: a star row is instantly legible
 * as a rating to anybody who has used the internet, and five rules are not,
 * for the first second. **That is why this component is never shown alone.**
 * `ProductRating` prints the numeral and the buyer count beside it, and the
 * accessible name is the number — so the marks are decoration over a value
 * that is already written in words, never the only carrier of it.
 * ---------------------------------------------------------------------------
 *
 * There is no empty state here and there must not be one. A row of five
 * unfilled marks is the *shape* of a rating, and rendering the shape before
 * the substance exists is the thing rule 5 forbids. This component is only
 * ever reached from `ProductRating`, which returns null first.
 */

export type RatingMarksProps = {
  /** 1–5. A real average of real reviews, never a placeholder. */
  rating: number;
  style?: StyleProp<ViewStyle>;
};

const POSITIONS = [1, 2, 3, 4, 5] as const;

export function RatingMarks({ rating, style }: RatingMarksProps) {
  // Math.round, matching the web's `Stars` exactly, so 4.4 fills four marks
  // on both clients rather than four here and five there.
  const filled = Math.round(rating);

  return (
    <View
      // One image with the number as its name, not five nodes. A reader
      // announcing "star, star, star, star, star" for every review on a
      // screen is noise, and the value is what was wanted — the same
      // reasoning, and the same phrasing, as the web's Stars.
      accessibilityRole="image"
      accessibilityLabel={`${rating} out of 5`}
      style={[styles.row, style]}
    >
      {POSITIONS.map((position) => (
        <View
          key={position}
          // Decorative individually; the row above carries the name.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.mark, position <= filled ? styles.filled : styles.empty]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.x1,
  },
  mark: {
    width: 14,
    height: 4,
    borderRadius: radius.full,
  },
  // gold-600 as a FILL, which is allowed at any weight. It is gold as *ink*
  // that is restricted to gold-800 — gold-600 lands at 2.84:1 on paper, under
  // even the 3:1 large-text floor. See the gold trap in src/theme/index.ts.
  filled: {
    backgroundColor: color.gold600,
  },
  empty: {
    backgroundColor: color.green200,
  },
});
