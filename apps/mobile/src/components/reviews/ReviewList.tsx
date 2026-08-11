import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import type { ProductReviewsEntry } from "@ekmool/contracts/documents";

import { RatingMarks } from "@/components/reviews/RatingMarks";
import { Eyebrow } from "@/components/ui";
import { color, font, space, type as typeScale } from "@/theme";

/**
 * The published reviews for one product — **or nothing, heading included**.
 *
 * The heading lives inside this component rather than on the screen that
 * mounts it, and that is the whole reason the component exists at all. A
 * screen that draws "What buyers said" and then asks a child whether it has
 * anything to say has already broken rule 5 by the time the child returns
 * null: the heading is the shape of social proof, and the shape is what makes
 * an unreviewed product look like it has been ignored rather than like it is
 * new. Owning both means the failure is not reachable from a call site.
 *
 * Everything here has been moderated. A review reaches `reviews-v1.json` only
 * after the owner has read it in /admin, and it reached the queue only from a
 * delivered order in the reviewer's own name — `findReviewableOrder`. Nothing
 * on this screen was written by the shop, and nothing was bought.
 *
 * There is deliberately no truncation, no "read more" and no sort control.
 * The reader caps the document at 20 per product, most recent first; a
 * control that let a visitor surface the five-star ones first would be the
 * shop arranging its own evidence.
 */

/**
 * `en-IN`, IST — the design system's rule for every date on both clients.
 * Built once at module scope: `Intl.DateTimeFormat` is expensive to
 * construct and this renders inside a list.
 */
const REVIEW_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

function formatDate(iso: string): string | null {
  const date = new Date(iso);
  // An unparseable stamp from an older document is dropped rather than
  // rendered as "Invalid Date", which is the kind of thing that ships.
  return Number.isNaN(date.getTime()) ? null : REVIEW_DATE.format(date);
}

export type ReviewListProps = {
  /** From `reviewsForProduct()`. Null renders nothing, exactly as empty does. */
  entry: ProductReviewsEntry | null;
  style?: StyleProp<ViewStyle>;
};

export function ReviewList({ entry, style }: ReviewListProps) {
  // Rule 5, the same gate as ProductRating and for the same reason. No
  // heading escapes above this line.
  if (!entry) return null;
  if (entry.reviews.length === 0) return null;

  return (
    <View style={[styles.section, style]}>
      <Eyebrow heading>What buyers said</Eyebrow>

      {entry.reviews.map((review) => {
        const date = formatDate(review.createdAt);
        return (
          <View key={review.id} style={styles.review}>
            <RatingMarks rating={review.rating} />
            <Text style={styles.title}>{review.title}</Text>
            <Text style={styles.body}>{review.body}</Text>
            <Text style={styles.byline}>
              {/* "Bibhash S." — a derived byline, never the name on the
                  parcel. The document carries no email and no order id;
                  that is checked in the contract, not assumed. */}
              {review.displayName}
              <Text style={styles.verified}> · Verified buyer</Text>
              {date === null ? "" : ` · ${date}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: space.x10,
  },
  review: {
    marginTop: space.x7,
    paddingTop: space.x6,
    borderTopWidth: 1,
    borderTopColor: color.green200,
    gap: space.x3,
  },
  title: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t17,
    color: color.green900,
  },
  body: {
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  byline: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  // green-900 on paper, matching the web's emphasis on the same two words.
  // It is the only part of the byline that is a claim the shop is making.
  verified: {
    color: color.green900,
  },
});
