import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { INDIAN_STATE_OPTIONS } from "@ekmool/contracts/checkout";

import { Button } from "@/components/ui";
import { color, font, hairline, radius, space, type } from "@/theme";

/**
 * The state field — React Native's answer to the web's `<select>`.
 *
 * There is no native select on this platform. `@react-native-picker/picker`
 * is the usual reach and it is a dependency (rule 12), and the two things it
 * would buy — the iOS wheel and the Android dropdown — are not obviously
 * better here than a full-screen list of 36 rows: at 200% text scale a wheel
 * shows two and a half options, and a dropdown anchored to a field near the
 * bottom of a scrolling form opens over the keyboard. So this is a button
 * that opens a list, which is what both platforms' own settings screens do
 * with a long enumeration.
 *
 * The list itself is `INDIAN_STATE_OPTIONS` from `@ekmool/contracts/checkout`
 * — the same tuple the server's `z.enum` is built from. A second copy typed
 * out here would be a copy that could disagree with the schema, and the
 * symptom would be a state a customer can pick and the server then refuses.
 *
 * Accessibility notes that are not obvious:
 *
 *  - The trigger announces as a button whose value is the chosen state, so a
 *    screen reader user hears the current answer without opening the list.
 *  - Rows are `radio`, not `button`. Thirty-six buttons give no clue that
 *    picking one unpicks the others.
 *  - The modal is marked as such, so VoiceOver does not read the form behind
 *    it.
 */

export type StateFieldProps = {
  /** Empty until one is chosen. Never a pre-selected state — a wrong default
   *  that looks filled in is worse than an empty field that asks. */
  value: string;
  onChange: (state: string) => void;
  error?: string;
};

const LABEL = "State";

export function StateField({ value, onChange, error }: StateFieldProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const choose = useCallback(
    (state: string) => {
      onChange(state);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{LABEL}</Text>

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={LABEL}
        // The chosen state read as the control's value rather than folded
        // into its name, so the label stays "State" as the customer moves
        // through the form and only the value changes.
        accessibilityValue={{ text: value === "" ? "Not selected" : value }}
        accessibilityHint={error ?? "Opens a list of Indian states"}
        android_ripple={{ color: color.green200 }}
        style={[styles.trigger, error ? styles.triggerInvalid : null]}
      >
        <Text style={value === "" ? styles.triggerEmpty : styles.triggerValue}>
          {value === "" ? "Select a state" : value}
        </Text>
      </Pressable>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        animationType="slide"
        // The Android hardware back button. Without this the list is a trap:
        // back closes the app instead of the sheet.
        onRequestClose={close}
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>
              {LABEL}
            </Text>
            <Button variant="secondary" onPress={close}>
              Close
            </Button>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetList}
            accessibilityRole="radiogroup"
          >
            {INDIAN_STATE_OPTIONS.map((state, index) => {
              const selected = state === value;
              return (
                <Pressable
                  key={state}
                  onPress={() => choose(state)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={state}
                  android_ripple={{ color: color.green200 }}
                  style={[
                    styles.row,
                    index === 0 && styles.rowFirst,
                    selected && styles.rowSelected,
                  ]}
                >
                  <Text style={styles.rowLabel}>{state}</Text>
                  {/* A mark as well as the field change: the selected row must
                      not be identifiable by its background alone. */}
                  {selected && (
                    <Text aria-hidden style={styles.rowMark}>
                      ✓
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
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
  trigger: {
    marginTop: space.x2,
    minHeight: space.x11,
    justifyContent: "center",
    borderWidth: hairline,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.paper,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    overflow: "hidden",
  },
  triggerInvalid: {
    borderColor: color.terracotta,
  },
  triggerValue: {
    fontFamily: font.body,
    ...type.t17,
    color: color.green900,
  },
  // green-700 on paper is 8.9:1 — this is the unfilled state of a control,
  // not greyed-out text, and it has to be as readable as the filled one.
  triggerEmpty: {
    fontFamily: font.body,
    ...type.t17,
    color: color.green700,
  },
  error: {
    marginTop: space.x1_5,
    fontFamily: font.bodyMedium,
    ...type.t15,
    color: color.terracotta,
  },
  sheet: {
    flex: 1,
    backgroundColor: color.paper,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x4,
    paddingHorizontal: space.x5,
    paddingVertical: space.x4,
    borderBottomWidth: hairline,
    borderBottomColor: color.green200,
  },
  sheetTitle: {
    flex: 1,
    fontFamily: font.display,
    ...type.t26,
    color: color.green900,
  },
  sheetList: {
    paddingHorizontal: space.x5,
    paddingBottom: space.x16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x4,
    minHeight: space.x12,
    paddingVertical: space.x3,
    borderTopWidth: hairline,
    borderTopColor: color.green200,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  rowSelected: {
    backgroundColor: color.gold100,
  },
  rowLabel: {
    flex: 1,
    fontFamily: font.body,
    ...type.t17,
    color: color.green900,
  },
  rowMark: {
    fontFamily: font.bodySemiBold,
    ...type.t17,
    color: color.gold800,
  },
});
