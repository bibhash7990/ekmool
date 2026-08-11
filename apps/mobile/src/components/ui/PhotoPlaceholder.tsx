import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { color, font, hairline, mix, space, type, withAlpha } from "@/theme";

/**
 * The toned art-direction stand-in, ported from the web.
 *
 * There is no stock photography in this project on purpose, so every image
 * slot renders tinted paper carrying the art direction for the shot that
 * belongs there. When a real photograph arrives it replaces this at the same
 * aspect ratio and the direction becomes its alt text — which is why the
 * direction is the `accessibilityLabel` here already. That is the whole
 * point of the prop: it is not a caption, it is the alt text arriving early.
 */

export type PhotoTone = "gold" | "green" | "terracotta";

export type PhotoPlaceholderProps = {
  /**
   * Width divided by height. The web takes the CSS string `"4 / 5"`; React
   * Native's `aspectRatio` is a number, so the call site writes the same
   * thing as an expression — `ratio={4 / 5}` — rather than this component
   * parsing a string to get back to the number it needed.
   */
  ratio?: number;
  /** Set from the product row's accent, never chosen in a component. */
  tone?: PhotoTone;
  /** The art-direction note. Becomes the accessible name. */
  direction: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The web caps the caption at `max-w-[34ch]`. React Native has no `ch`, and
 * the cap is not dead weight on a phone: a 430pt device less the 20pt gutter
 * and the 20pt inner padding leaves 350pt of caption, which is wider than
 * 34 characters of Figtree. 17 x the font size is 34ch at roughly 0.5em per
 * lowercase character, derived from the token rather than typed as 255.
 */
const MAX_CAPTION_WIDTH = type.t15.fontSize * 17;

export function PhotoPlaceholder({
  ratio = 4 / 5,
  tone = "gold",
  direction,
  style,
}: PhotoPlaceholderProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={direction}
      // `aspectRatio` is the one genuinely per-instance value and cannot live
      // in the sheet; everything else that could be static, is.
      style={[styles.frame, tones[tone], { aspectRatio: ratio }, style]}
    >
      {/* The caption sits at the top so overlay elements can anchor to the
          lower edge without colliding — same reason as the web. */}
      <View style={styles.body}>
        <View style={styles.tick} />
        <Text style={styles.caption}>{direction}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    borderWidth: hairline,
    borderColor: color.green200,
  },
  // The web's three tones. `gold` is flat gold-100; the other two are
  // `color-mix(in srgb, X n%, paper)`, reproduced arithmetically by `mix()`
  // in the theme so the phone lands on the same eight-bit value the browser
  // does rather than a hand-picked approximation. Registered here rather than
  // computed in render: a colour mix is a pure function of the tokens, and
  // recomputing it per card in a list allocates a string that never changes.
  gold: {
    backgroundColor: color.gold100,
  },
  terracotta: {
    backgroundColor: mix(color.terracotta, color.paper, 0.14),
  },
  green: {
    backgroundColor: mix(color.green200, color.paper, 0.55),
  },
  body: {
    padding: space.x5,
  },
  // The web's `h-px w-16 bg-ek-green-900/20`.
  tick: {
    width: space.x16,
    height: hairline,
    backgroundColor: withAlpha(color.green900, 0.2),
  },
  caption: {
    marginTop: space.x3,
    maxWidth: MAX_CAPTION_WIDTH,
    fontFamily: font.body,
    // Full-opacity green-700, not a tint of it. The web carries the same
    // comment for the same reason: at 70% it drops below 4.5:1 on gold-100.
    color: color.green700,
    ...type.t15,
    // The web sets this italic. There is no Figtree italic file in
    // assets/fonts/, and `fontStyle: "italic"` against a named family
    // synthesises an oblique — the same synthesised-face problem the design
    // system rules out for weight. The caption is distinguished by its size
    // and its position instead.
  },
});

const tones: Record<PhotoTone, ViewStyle> = {
  gold: styles.gold,
  terracotta: styles.terracotta,
  green: styles.green,
};
