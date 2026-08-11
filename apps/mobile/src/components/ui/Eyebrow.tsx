import { StyleSheet, Text } from "react-native";
import type { StyleProp, TextStyle } from "react-native";

import { color, font, tracking, type } from "@/theme";

/**
 * The letterspaced-caps label that sits above a section heading — the web's
 * `.eyebrow` utility in `globals.css`: display face, text-15, uppercase,
 * 0.18em tracking, line-height 1.4.
 *
 * Two things did not port literally.
 *
 * **Tracking.** CSS's `0.18em` scales with the type; React Native's
 * `letterSpacing` is absolute points. Writing `letterSpacing: 0.18` here
 * would be a fifteenth of the intended tracking and would look like a
 * rendering bug rather than a mistake. The multiplication is explicit below
 * and `tracking.eyebrow` is the em value, kept in the theme so a second
 * tracked style computes from the same number.
 *
 * **`as="h2"`.** There are no heading levels in React Native — the accessible
 * name tree is flat and a screen reader announces "heading", not "heading
 * level 2". So the web's `as` prop becomes `heading`, which sets
 * `accessibilityRole="header"`. Set it on the eyebrow that IS the section's
 * heading and leave it off the ones that label a heading underneath, exactly
 * as on the web — two adjacent headers for one section is the same defect
 * there and here.
 */

export type EyebrowTone = "default" | "onDark";

export type EyebrowProps = {
  children: string;
  /** True when this eyebrow is the section's heading, not a label above one. */
  heading?: boolean;
  /** `onDark` for the one green-950 band a page is allowed. */
  tone?: EyebrowTone;
  style?: StyleProp<TextStyle>;
};

export function Eyebrow({
  children,
  heading = false,
  tone = "default",
  style,
}: EyebrowProps) {
  return (
    <Text
      accessibilityRole={heading ? "header" : undefined}
      style={[styles.eyebrow, tones[tone], style]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: font.display,
    fontSize: type.t15.fontSize,
    // The web's `.eyebrow` overrides the token's 1.55 to 1.4, because a
    // single tracked line does not need body leading. 15 x 1.4 = 21.
    lineHeight: Math.round(type.t15.fontSize * 1.4),
    letterSpacing: type.t15.fontSize * tracking.eyebrow,
    textTransform: "uppercase",
  },
  // green-700 on paper is 8.9:1. The uppercase is a visual transform only —
  // the string a screen reader receives keeps its original casing, so there
  // is nothing to correct with an accessibilityLabel.
  default: {
    color: color.green700,
  },
  // On green-950, gold-500 is a fill colour used as ink and that is allowed:
  // the gold trap is about gold on a LIGHT ground. Against the darkest green
  // gold-500 is the accent the design system names as the root motif.
  onDark: {
    color: color.gold500,
  },
});

const tones: Record<EyebrowTone, TextStyle> = {
  default: styles.default,
  onDark: styles.onDark,
};
