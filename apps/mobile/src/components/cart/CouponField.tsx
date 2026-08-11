import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { couponApplied, couponCleared } from "@ekmool/core/cart";
import { formatPaise } from "@ekmool/core/money";

import type { CouponQuote } from "@/api/coupons";
import { Eyebrow } from "@/components/ui";
import { useAppDispatch } from "@/store";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * The promotion code box — a port of
 * `apps/web/src/components/cart/CouponField.tsx`, same behaviour and same
 * copy.
 *
 * What it shows is a quote, and the copy says so. Checkout re-runs every rule
 * against a locked coupon row, so a code that reads as valid here can still
 * be refused there.
 *
 * **The refusal sentence is never written in this file.** It arrives on the
 * quote, composed by `couponRefusalMessage` in `@ekmool/core/coupons` — the
 * same function the server calls — so the phone and the site name the same
 * rule in the same words: "That code needs a basket of at least ₹500", never
 * "Invalid code". `src/api/coupons.ts` explains which of the two ends
 * composed it and why.
 *
 * The quote is not held here. It belongs to the screen, because the summary
 * needs the same discount this field is describing, and two components each
 * asking the server would be two answers that can disagree.
 */

export type CouponFieldProps = {
  code: string | null;
  quote: CouponQuote | null;
  busy: boolean;
};

/** The endpoint's own floor, from `couponCodeSchema` — `[A-Z0-9-]{3,40}`. */
const MIN_CODE_LENGTH = 3;
const MAX_CODE_LENGTH = 40;

export function CouponField({ code, quote, busy }: CouponFieldProps) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState("");

  const apply = useCallback(() => {
    const next = draft.trim().toUpperCase();
    if (next.length < MIN_CODE_LENGTH) return;
    dispatch(couponApplied(next));
    setDraft("");
  }, [dispatch, draft]);

  const clear = useCallback(() => {
    dispatch(couponCleared());
  }, [dispatch]);

  if (code !== null) {
    return (
      <View style={styles.block}>
        <View style={styles.appliedRow}>
          <Text style={styles.appliedCode}>
            {code}
            {busy && <Text style={styles.appliedBusy}> · checking…</Text>}
          </Text>
          <Pressable
            onPress={clear}
            accessibilityRole="button"
            accessibilityLabel={`Remove the code ${code} from the basket`}
            style={styles.removeTarget}
          >
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>

        {/*
          One live region for all three outcomes, rather than a region per
          branch: a reader should hear the answer once, whichever answer it
          is. iOS has no live region for an already-mounted node, so this is
          Android's announcement and VoiceOver users reach the sentence by
          moving to it — acceptable here because, unlike add-to-basket, the
          customer is looking at the field they just used.
        */}
        <View accessibilityLiveRegion="polite" style={styles.result}>
          {quote?.status === "granted" && (
            <Text style={styles.granted}>
              {quote.description}
              {quote.shippingWaivedPaise > 0 &&
                ` — delivery on us (${formatPaise(quote.shippingWaivedPaise)})`}
            </Text>
          )}
          {quote?.status === "refused" && (
            <Text style={styles.refused}>{quote.message}</Text>
          )}
          {quote?.status === "unchecked" && (
            <Text style={styles.unchecked}>
              {quote.message} The code stays on the basket and checkout decides
              whether it applies.
            </Text>
          )}
        </View>
      </View>
    );
  }

  const applicable = draft.trim().length >= MIN_CODE_LENGTH;

  return (
    <View style={styles.block}>
      {/*
        A visible label, associated with the input rather than merely sitting
        above it. A placeholder is not a label — it disappears exactly when
        the customer needs it — so `placeholder` is deliberately absent here
        and the design system's rule ports over unchanged.

        `nativeID` + `accessibilityLabelledBy` is the association TalkBack
        reads; `accessibilityLabel` is the same string for VoiceOver, which
        does not implement the labelled-by relationship on a TextInput. The id
        is a literal because there is one coupon field per screen — if this
        component is ever rendered twice, it needs `useId`.

        The id sits on a wrapping View rather than on `Eyebrow`, which takes
        no `nativeID`. Adding one to the primitive would have been the tidier
        change and is somebody else's file.
      */}
      <View nativeID="coupon-label">
        <Eyebrow style={styles.label}>Promotion code</Eyebrow>
      </View>
      <View style={styles.entry}>
        <TextInput
          value={draft}
          onChangeText={(next) =>
            // The same character set `couponCodeSchema` accepts, applied as
            // the customer types. Filtering here rather than refusing on
            // submit means a lowercase paste becomes a valid code instead of
            // an error message about one.
            setDraft(next.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
          }
          onSubmitEditing={apply}
          maxLength={MAX_CODE_LENGTH}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
          accessibilityLabel="Promotion code"
          accessibilityLabelledBy="coupon-label"
          // gold-600 as a selection fill, which is a fill and not ink — the
          // gold trap only applies to gold used as text on a light ground.
          selectionColor={color.gold600}
          style={styles.input}
        />
        <Pressable
          onPress={apply}
          disabled={!applicable}
          accessibilityRole="button"
          accessibilityState={{ disabled: !applicable }}
          accessibilityLabel="Apply the promotion code"
          accessibilityHint={
            applicable
              ? undefined
              : "Enter at least three characters to apply a code"
          }
          android_ripple={applicable ? { color: color.green200 } : null}
          style={[styles.applyButton, !applicable && styles.applyDisabled]}
        >
          <Text style={styles.applyLabel}>Apply</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: space.x6,
    borderTopWidth: 1,
    borderTopColor: color.green200,
    paddingTop: space.x5,
  },
  label: { marginBottom: space.x2_5 },
  entry: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: space.x2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: space.x11,
    paddingHorizontal: space.x3,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    // Cream, not paper: an input has to look like somewhere to type, and the
    // design system's card ground on light is the field this palette has for
    // that. Cream against paper is a 1.04:1 difference, so the border is what
    // actually delimits the control — hence a border on all four sides rather
    // than the underline React Native invites on Android.
    backgroundColor: color.cream,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
    // 0.06em of tracking, as the web's `tracking-[0.06em]` — a promotion code
    // is read character by character, not as a word.
    letterSpacing: typeScale.t17.fontSize * 0.06,
  },
  applyButton: {
    minHeight: space.x11,
    justifyContent: "center",
    paddingHorizontal: space.x5,
    borderWidth: 1,
    borderColor: color.green900,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  applyDisabled: { opacity: 0.45 },
  applyLabel: {
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  appliedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x2,
  },
  appliedCode: {
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
    letterSpacing: typeScale.t17.fontSize * 0.06,
  },
  appliedBusy: {
    fontFamily: font.body,
    color: color.green700,
    letterSpacing: 0,
  },
  removeTarget: { minHeight: space.x11, justifyContent: "center" },
  removeText: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
    textDecorationLine: "underline",
  },
  result: { marginTop: space.x1 },
  granted: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  // Terracotta is the palette's error ink and clears 4.5:1 on paper. It is
  // not the only signal: the sentence itself names the rule that refused.
  refused: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.terracotta,
  },
  unchecked: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
});
