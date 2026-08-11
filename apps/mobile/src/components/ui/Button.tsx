import { Platform, Pressable, StyleSheet, Text } from "react-native";
import type {
  PressableAndroidRippleConfig,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";

import { color, font, hairline, radius, space, type, withAlpha } from "@/theme";

/**
 * The button, ported from `apps/web/src/components/ui/Button.tsx` — same
 * three variants, same two sizes, same 44pt floor.
 *
 * The web has `Button` and `ButtonLink` because an `<a>` and a `<button>` are
 * different elements with different semantics. On React Native there is one
 * `Pressable` and navigation is a function call, so there is one component;
 * a screen that navigates passes `onPress={() => router.push(...)}`.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

export type ButtonProps = {
  /**
   * The label, as a string rather than a node.
   *
   * React Native cannot render bare text outside a `<Text>`, so a `ReactNode`
   * child would have to be wrapped by the caller — at which point the caller
   * owns the family, the size and the colour, and three screens later they
   * do not agree. Taking the string means this component is the only place
   * the button's type is decided, and it doubles as the accessibility name.
   */
  children: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Say what will happen, when the label alone does not. */
  accessibilityHint?: string;
  /** Only when the visible label is not the right spoken name. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Press feedback. Android gets its platform ripple; iOS, which has no ripple,
 * gets an opacity change. Both are instant rather than animated — the design
 * system's 150-300ms budget is for state transitions, and a press indicator
 * that arrives 150ms after the finger reads as lag, which is the whole
 * complaint `Reveal` was left off the phone for.
 */
const usesOpacityFeedback = Platform.OS === "ios";

/**
 * Built once at module scope. `android_ripple` takes an object, and building
 * it in the render body would allocate a new one on every press state change
 * of every button on the screen — for a config that is a pure function of the
 * variant.
 *
 * Dark ripple on the gold fill, dark-but-fainter on the paper ground: a
 * ripple has to contrast with what it lands on to be visible at all.
 */
const ripple: Record<ButtonVariant, PressableAndroidRippleConfig> = {
  primary: { color: withAlpha(color.green950, 0.14) },
  secondary: { color: withAlpha(color.green900, 0.1) },
  ghost: { color: withAlpha(color.green900, 0.1) },
};

export function Button({
  children,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  accessibilityHint,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // Pressable's `disabled` already folds into accessibilityState, but
      // stating it puts the programmatic half of "visibly and programmatically
      // disabled" in the diff rather than in a reader's knowledge of RN.
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      // No ripple on a button that will not respond to the press.
      android_ripple={disabled ? null : ripple[variant]}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        sizes[size],
        variants[variant],
        disabled ? styles.disabled : null,
        pressed && usesOpacityFeedback && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      <Text style={[styles.label, labels[variant]]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.x2,
    borderRadius: radius.sm,
    // A border on every variant, transparent where the design has none, so
    // the three variants are the same height to the pixel. Without it a
    // secondary button next to a primary one sits 2pt taller.
    borderWidth: hairline,
    borderColor: "transparent",
    // Clips the Android ripple to the rounded rectangle. Without it the
    // ripple paints square corners over the radius.
    overflow: "hidden",
  },

  // 44pt is the floor from rule 11 and it applies to both sizes, not just
  // the small one. `md` IS the floor; `lg` is the web's `min-h-13`.
  md: {
    minHeight: space.x11,
    paddingHorizontal: space.x5,
    paddingVertical: space.x2_5,
  },
  lg: {
    minHeight: space.x13,
    paddingHorizontal: space.x7,
    paddingVertical: space.x3_5,
  },

  primary: {
    backgroundColor: color.gold500,
    borderColor: color.gold500,
  },
  secondary: {
    backgroundColor: "transparent",
    borderColor: color.green900,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },

  label: {
    fontFamily: font.bodyMedium,
    ...type.t17,
    textAlign: "center",
  },
  // green-950 on gold-500 is the one place gold is allowed under text, and
  // it is allowed because the gold is the *ground*, not the ink. Gold as ink
  // on a light surface is gold-800 only.
  primaryLabel: {
    color: color.green950,
  },
  secondaryLabel: {
    color: color.green900,
  },
  ghostLabel: {
    color: color.green900,
    // Always underlined, where the web underlines on hover. Touch has no
    // hover, and the design system's rule is that hover is never the only
    // way to reach anything — an un-underlined ghost button on a phone is
    // indistinguishable from a line of body copy.
    textDecorationLine: "underline",
  },

  disabled: {
    // The web's `disabled:opacity-55`.
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.7,
  },
});

const sizes: Record<ButtonSize, ViewStyle> = {
  md: styles.md,
  lg: styles.lg,
};

const variants: Record<ButtonVariant, ViewStyle> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
};

const labels: Record<ButtonVariant, TextStyle> = {
  primary: styles.primaryLabel,
  secondary: styles.secondaryLabel,
  ghost: styles.ghostLabel,
};
