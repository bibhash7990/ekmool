import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { color, font, space, type } from "@/theme";

/**
 * A bordered block of copy, with room for controls under it.
 *
 * Every refusal on the checkout screen renders through this: the item that
 * sold out, the coupon that was declined, the wait after a rate limit, "we
 * could not reach our order system just now — nothing has been charged". None
 * of them is an `Alert.alert`, and that is a decision rather than an
 * oversight. A system alert has one dismiss button, no room for the control
 * that would fix the problem, and it disappears — so a customer who taps OK
 * and then wants to re-read what it said has nothing left. A refusal that
 * names a rule needs to stay on screen next to the thing it is about.
 *
 * Two tones only. `refusal` is terracotta-edged and carries `role="alert"`,
 * which interrupts a screen reader; `info` is gold-edged and polite. Anything
 * that would interrupt a customer to tell them something they did not ask
 * about is the second one.
 */

export type NoticeTone = "refusal" | "info";

export type NoticeProps = {
  tone?: NoticeTone;
  /** The sentence. Usually the server's own `error` string, unedited. */
  message: string;
  /** Optional heading above the message, for a refusal that names an item. */
  title?: string;
  /** Buttons that act on the refusal — "Reduce to 2", "Remove that code". */
  children?: ReactNode;
};

export function Notice({ tone = "refusal", message, title, children }: NoticeProps) {
  return (
    <View
      accessibilityRole={tone === "refusal" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "refusal" ? "assertive" : "polite"}
      style={[styles.notice, tone === "refusal" ? styles.refusal : styles.info]}
    >
      {title !== undefined && <Text style={styles.title}>{title}</Text>}
      <Text style={styles.message}>{message}</Text>
      {children !== undefined && <View style={styles.actions}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginTop: space.x6,
    // A left rule rather than a filled panel, which is the web's shape for
    // the same block (`border-l-2` on the checkout error). A tinted card
    // large enough to hold three buttons reads as a section of the page.
    borderLeftWidth: 2,
    paddingLeft: space.x4,
    paddingVertical: space.x2,
  },
  refusal: {
    borderLeftColor: color.terracotta,
  },
  info: {
    borderLeftColor: color.gold500,
  },
  title: {
    fontFamily: font.bodySemiBold,
    ...type.t17,
    color: color.green900,
  },
  message: {
    marginTop: space.x1_5,
    fontFamily: font.body,
    ...type.t17,
    // green-900, not terracotta. Terracotta is the *edge* that says something
    // is wrong; terracotta as the body ink of a three-line paragraph is
    // 4.6:1 on paper, which passes, and reads as shouting.
    color: color.green900,
  },
  actions: {
    marginTop: space.x4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x3,
  },
});
