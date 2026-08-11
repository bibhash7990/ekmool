import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import type { ProductReviewsEntry } from "@ekmool/contracts/documents";

import { RatingMarks } from "@/components/reviews/RatingMarks";
import { color, font, space, type as typeScale } from "@/theme";

/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ RULE 5. A PRODUCT NOBODY HAS REVIEWED SHOWS NO RATING AT ALL.        │
 * │                                                                      │
 * │ Not a zero. Not a row of grey marks. Not "No ratings yet". Not "Be   │
 * │ the first to review". Not a heading with nothing under it. Nothing.  │
 * │                                                                      │
 * │ This component is the single gate, and the `return null` below is    │
 * │ the whole of it. Every surface that wants to show a rating —          │
 * │ product screen, shelf card, search result, saved list — mounts THIS  │
 * │ and passes the entry. None of them may read `entry.rating` and draw  │
 * │ their own, because then there would be four places to get it right   │
 * │ and the fourth is the one that ships.                                │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * ## Why the empty case is silence and not a sentence
 *
 * The tempting empty state is "Nobody has reviewed this yet" — which the
 * web's product page does say, in a paragraph, under a heading it always
 * draws. That works there because a product page is a document with sections
 * and the sentence is doing editorial work: *we do not write our own, and we
 * do not buy them in.*
 *
 * It does not port. On a phone the same sentence sits in a scroll view with
 * nothing under it, and the reader has to scroll past an announcement that
 * something is absent. Worse, it establishes the *shape* — a reviews block
 * exists on this screen — which is the half of rule 5 that
 * `apps/web/src/components/home/HomeReviews.tsx` is written to avoid: "a home
 * page that says 'reviews coming soon' under a row of grey stars has decided
 * that the shape of social proof is worth showing before the substance
 * exists, and every visitor who has seen a seeded testimonial knows what that
 * shape is worth."
 *
 * So the phone takes the home page's answer rather than the product page's:
 * `null`. The editorial sentence about never buying reviews belongs on the
 * screen once, as copy that is true whether or not a rating exists, and not
 * as a stand-in for one.
 *
 * ## Both directions are asserted
 *
 * The web has `test:home` for exactly this pair — nothing rendered when there
 * are none, the real figures rendered when there are. The phone's version is
 * check 5 in `scripts/check-mobile.mjs`, which reads this file and fails if
 * the `return null` stops preceding the JSX, if a zero fallback appears, if
 * any of the forbidden empty-state phrases turn up anywhere in `app/` or
 * `src/`, or if the positive direction stops reading `rating.average` and
 * `rating.count`. It was negative-tested by planting each violation in turn.
 */

export type ProductRatingProps = {
  /**
   * From `reviewsForProduct()`. `null` when the reviews document has not been
   * downloaded, when this phone's copy predates the product, or when the
   * entry is unusable — all three mean "we do not know of a review", and the
   * honest rendering of that is identical to "there are none".
   */
  entry: ProductReviewsEntry | null;
  style?: StyleProp<ViewStyle>;
};

export function ProductRating({ entry, style }: ProductRatingProps) {
  // ── Rule 5. Do not add an `else` to this. ──
  //
  // Every guard is separate rather than one `&&` chain, so a future edit that
  // relaxes one of them has to delete a line that says what it is for.
  if (!entry) return null;
  if (entry.rating === null) return null;
  if (entry.rating.count < 1) return null;

  const { average, count } = entry.rating;

  return (
    <View style={[styles.row, style]}>
      <RatingMarks rating={average} />
      <Text style={styles.average}>{average.toFixed(1)}</Text>
      <Text style={styles.count}>
        {`from ${count} verified ${count === 1 ? "buyer" : "buyers"}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x3,
  },
  average: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t20,
    color: color.green900,
    // The web sets `tabular-nums` so a changing average does not shift the
    // line. Figtree's figures are already tabular in the faces this app
    // embeds, and React Native has no fontVariant equivalent that is
    // reliable across both text engines, so this is noted rather than set.
  },
  count: {
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
});
