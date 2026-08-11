import { StyleSheet, Text, TextInput, View } from "react-native";
import type { StyleProp, TextInputProps, ViewStyle } from "react-native";

import { color, font, hairline, radius, space, type } from "@/theme";

/**
 * One labelled text input.
 *
 * **The label is a `<Text>` above the field and it never goes away.** That is
 * the whole component, and it is the reason it exists rather than each screen
 * writing a `TextInput`: React Native makes the floating-label pattern easy
 * and the design system's answer is already no — "a placeholder is not a
 * label; it disappears exactly when the user needs it", which on a checkout
 * form means at the moment somebody is checking what they typed. There is
 * deliberately no `placeholder` prop below. A field that needs more than its
 * label gets a `hint`, which is also permanent.
 *
 * The error sits **next to the field**, not only in a summary at the top.
 * A summary is fine as well; a summary alone means scrolling back and
 * counting inputs to find out which one it meant.
 *
 * 200% text scale is a supported size, not a stretch goal, so nothing here
 * has a fixed height — `minHeight` holds the 44pt touch-target floor and the
 * box grows past it when the system font is large.
 */

export type FieldProps = {
  /** Visible, always. Also the accessible name. */
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Rendered under the field, in terracotta. Replaces the hint while set. */
  error?: string;
  /** Permanent helper text. "10 digits, for delivery calls." */
  hint?: string;
  /**
   * Marks the field optional in the label and to a screen reader. Every other
   * field is required, and saying so on nine of eleven labels is noise —
   * naming the two that are not is the information.
   */
  optional?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  /** Android's autofill hint. */
  autoComplete?: TextInputProps["autoComplete"];
  /** iOS's autofill hint. Both are set at every call site; they are separate APIs. */
  textContentType?: TextInputProps["textContentType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  maxLength?: number;
  multiline?: boolean;
  /**
   * A callback ref onto the underlying `TextInput`, so the screen can move
   * focus to the first field a refusal named. `Field` is a function component
   * and does not forward `ref` on its own; a named prop says that plainly
   * rather than leaving a reader to wonder why `ref` does nothing.
   */
  inputRef?: (node: TextInput | null) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Field({
  label,
  value,
  onChangeText,
  error,
  hint,
  optional = false,
  keyboardType,
  autoComplete,
  textContentType,
  autoCapitalize = "sentences",
  maxLength,
  multiline = false,
  inputRef,
  style,
  testID,
}: FieldProps) {
  const visibleLabel = optional ? `${label} (optional)` : label;

  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{visibleLabel}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        multiline={multiline}
        // The visible label repeated as the accessible name. TalkBack and
        // VoiceOver do not read a sibling `<Text>` as a field's label the way
        // a browser reads `<label for>` — there is no association to make —
        // so without this the input announces as "edit box" and nothing else.
        accessibilityLabel={visibleLabel}
        // The error takes the hint's place here as well as visually: a
        // screen reader landing on an invalid field should hear what is
        // wrong with it, not the advice that was there before it went wrong.
        accessibilityHint={error ?? hint}
        // Not the design system's green-700, which is body ink: a cursor and
        // a selection are the accent, and gold-500 is the accent as a *fill*,
        // which is what a caret is. (gold-500 as ink would fail 4.5:1 — see
        // the gold trap in src/theme.)
        selectionColor={color.gold500}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          error ? styles.inputInvalid : null,
        ]}
        testID={testID}
      />
      {error ? (
        // Announced on Android when it appears. iOS has no live region for an
        // already-mounted node, which is why the screen also announces the
        // count explicitly after a refusal.
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: space.x5,
  },
  label: {
    fontFamily: font.body,
    ...type.t15,
    color: color.green700,
  },
  input: {
    marginTop: space.x2,
    minHeight: space.x11,
    borderWidth: hairline,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.paper,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    fontFamily: font.body,
    ...type.t17,
    color: color.green900,
  },
  inputMultiline: {
    minHeight: space.x16,
    textAlignVertical: "top",
  },
  // Terracotta border AND the message below — never colour alone, which a
  // customer who cannot distinguish it would read as a field that is fine.
  inputInvalid: {
    borderColor: color.terracotta,
  },
  error: {
    marginTop: space.x1_5,
    fontFamily: font.bodyMedium,
    ...type.t15,
    color: color.terracotta,
  },
  hint: {
    marginTop: space.x1_5,
    fontFamily: font.body,
    ...type.t15,
    color: color.green700,
  },
});
