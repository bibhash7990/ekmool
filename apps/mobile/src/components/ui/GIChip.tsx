import { StyleSheet, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { color, font, radius, space, type } from "@/theme";

/**
 * The GI-tag badge — gold-100 field, the seal mark, the tag's name.
 *
 * The web draws the seal with `SealIcon`, three SVG paths. There is no SVG
 * renderer in this app (see `SoilLine.tsx` for why the library was not
 * taken), so the seal here is two Views: the mark's ring, and the stem that
 * drops out of it. That is the readable half of the icon at 14pt; the
 * horizontal bar through the ring in the web path is one pixel of detail at
 * this size and its absence is not visible on a phone.
 *
 * **The seal is gold-800, not gold-500.** This is the gold trap: gold-800 on
 * gold-100 measures 4.75:1 and clears the floor, gold-600 does not. A chip
 * drawn in the brighter gold looks better in a mockup and fails the audit,
 * which is exactly the mistake that does not look wrong.
 */

export type GIChipProps = {
  /** The GI tag's name, e.g. "Lakadong Turmeric". Never invented. */
  label: string;
  style?: StyleProp<ViewStyle>;
};

export function GIChip({ label, style }: GIChipProps) {
  return (
    // One accessibility element, so a screen reader says "Lakadong Turmeric"
    // once rather than announcing a decorative ring and then the label. The
    // spoken name is the visible label and nothing more: the web adds no
    // explanatory aria-label here, and inventing one on the phone would put
    // copy in front of a customer that no writer has seen.
    <View accessible accessibilityRole="text" style={[styles.chip, style]}>
      <View style={styles.seal}>
        <View style={styles.sealRing} />
        <View style={styles.sealStem} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const SEAL_SIZE = 14; // the web's `size-3.5`

const styles = StyleSheet.create({
  chip: {
    // `alignSelf` rather than a width: the web's `inline-flex` shrinks to its
    // content, and a bare View in React Native stretches to its parent.
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space.x1_5,
    borderRadius: radius.sm,
    backgroundColor: color.gold100,
    paddingHorizontal: space.x2_5,
    paddingVertical: space.x1,
  },

  seal: {
    width: SEAL_SIZE,
    height: SEAL_SIZE,
    alignItems: "center",
  },
  sealRing: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: color.gold800,
  },
  sealStem: {
    width: 1.5,
    // 10 - 1 + 5 = 14, the seal box exactly.
    height: 5,
    marginTop: -1,
    borderRadius: radius.full,
    backgroundColor: color.gold800,
  },

  label: {
    fontFamily: font.bodyMedium,
    color: color.green900,
    // The web sets `leading-none` here. This keeps the token's line height
    // instead, which makes the chip 8pt taller than the web's. A lineHeight
    // equal to the font size clips descenders on Android for some faces, and
    // a clipped "g" in "Lakadong" is a worse defect than a chip that
    // breathes. The design system's own rule — line heights are baked into
    // the tokens, do not override them — points the same way.
    ...type.t15,
  },
});
