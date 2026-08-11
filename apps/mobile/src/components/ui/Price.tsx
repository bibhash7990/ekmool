import { StyleSheet, Text } from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import { formatPaise } from "@ekmool/core/money";

import { color, font, type } from "@/theme";

/**
 * A price, from integer paise.
 *
 * `formatPaise` comes from `@ekmool/core/money` and is not reimplemented
 * here. That is the whole reason the package exists: the web and the phone
 * must round, group and place the rupee sign identically, and two
 * `Intl.NumberFormat` instances configured from memory in two repositories
 * is how a customer sees ₹1,299 on one screen and ₹1299.00 on the next.
 * `en-IN` grouping (1,29,900 paise reads as ₹1,299) comes with it.
 *
 * There is no rounding, clamping or `Number()` coercion here on purpose.
 * Money is integer paise by rule 4; if a non-integer arrives, the formatter
 * showing paise is the signal that something upstream is wrong, and
 * silently rounding it here would hide the defect at the only point anyone
 * would have noticed it.
 */

export type PriceTone = "ink" | "muted" | "onDark";

export type PriceProps = {
  /** Integer paise. Never rupees. */
  paise: number;
  /** A key of the type scale — `t20` for a card, `t26`/`t34` on a product. */
  size?: keyof typeof type;
  tone?: PriceTone;
  style?: StyleProp<TextStyle>;
  testID?: string;
};

export function Price({
  paise,
  size = "t20",
  tone = "ink",
  style,
  testID,
}: PriceProps) {
  return (
    <Text style={[styles.price, type[size], tones[tone], style]} testID={testID}>
      {formatPaise(paise)}
    </Text>
  );
}

const styles = StyleSheet.create({
  price: {
    // SemiBold, not `fontWeight: "600"`. Figtree's three weights are three
    // separately registered families here; asking Figtree-Regular for weight
    // 600 gets a synthesised smear, which the design system rules out for
    // display type and which looks no better on a number.
    fontFamily: font.bodySemiBold,
  },
  ink: {
    color: color.green900,
  },
  // green-700 on paper is 8.9:1 — "muted" is a hierarchy signal, not a
  // contrast reduction. There is no grey in this palette and none is wanted.
  muted: {
    color: color.green700,
  },
  onDark: {
    color: color.cream,
  },
});

const tones: Record<PriceTone, TextStyle> = {
  ink: styles.ink,
  muted: styles.muted,
  onDark: styles.onDark,
};
