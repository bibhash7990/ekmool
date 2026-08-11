import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import {
  MAX_QTY_PER_LINE,
  itemRemoved,
  qtySet,
  type CartItem,
} from "@ekmool/core/cart";
import { formatPaise } from "@ekmool/core/money";

import { Price } from "@/components/ui";
import { useAppDispatch } from "@/store";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * One line of the basket: what it is, how many, and what that comes to.
 *
 * **The line total is `unitPricePaise * qty` and nothing else.** No shipping,
 * no threshold, no tax — all of that is `@ekmool/core/shipping` and it is
 * computed once, on the screen, from the subtotal the slice already keeps.
 *
 * ── Stock is a courtesy here, not a guarantee ──
 *
 * `stockQty` comes from the catalogue document, which is regenerated on an
 * hourly window and may have been sitting on this phone for longer than that.
 * So the stepper caps at it to save a customer the walk to checkout, and the
 * copy never states the number: "3 left" from an hour-old file is rule 5's
 * fabricated scarcity with extra steps, and the product screen already
 * refuses to print a count for the same reason. The refusal that matters
 * arrives from `/api/checkout` as `INSUFFICIENT_STOCK` with the real figure.
 */

/**
 * Mirrors the clamp inside the `qtySet` reducer, which does not export it.
 *
 * Duplicated rather than inferred from `@ekmool/contracts`'s
 * `qty: z.number().max(10)` — digging a bound out of a Zod schema at runtime
 * is a brittle way to read a constant, and it would still be a second copy.
 * What this buys is a `+` that visibly stops rather than one that dispatches
 * an action the reducer silently discards, which reads as a broken button.
 */
// Was mirrored here as a literal because the slice kept it private. It is
// exported now, so the mirror is gone rather than commented.

export type CartLineProps = {
  item: CartItem;
  /**
   * The cached catalogue's stock for this variant, or `undefined` when the
   * catalogue is not on this phone yet. Undefined is not zero: a cold install
   * with a restored basket knows nothing about stock, and capping at zero
   * would lock every stepper on the strength of a file that has not arrived.
   */
  stockQty: number | undefined;
};

export function CartLine({ item, stockQty }: CartLineProps) {
  const dispatch = useAppDispatch();

  const cap =
    stockQty === undefined
      ? MAX_QTY_PER_LINE
      : Math.min(Math.max(0, Math.floor(stockQty)), MAX_QTY_PER_LINE);

  const atCap = item.qty >= cap;
  // True only when stock — not the ten-per-line rule — is what stopped the
  // `+`. Explaining a cap the customer has not hit, or crediting stock for
  // the per-line limit, would both be inaccurate.
  const cappedByStock = atCap && cap < MAX_QTY_PER_LINE;

  const decrease = useCallback(() => {
    dispatch(qtySet({ variantId: item.variantId, qty: item.qty - 1 }));
  }, [dispatch, item.qty, item.variantId]);

  const increase = useCallback(() => {
    dispatch(qtySet({ variantId: item.variantId, qty: item.qty + 1 }));
  }, [dispatch, item.qty, item.variantId]);

  const remove = useCallback(() => {
    dispatch(itemRemoved(item.variantId));
  }, [dispatch, item.variantId]);

  const open = useCallback(() => {
    router.push({
      pathname: "/product/[slug]",
      params: { slug: item.productSlug },
    });
  }, [item.productSlug]);

  const name = `${item.productName}, ${item.packLabel}`;

  return (
    <View style={styles.line}>
      <View style={styles.main}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={name}
          accessibilityHint="Opens the product"
          style={styles.titleTarget}
        >
          <Text style={styles.title}>{item.productName}</Text>
        </Pressable>
        <Text style={styles.meta}>
          {item.packLabel} · {formatPaise(item.unitPricePaise)} each
        </Text>

        {/*
          Two buttons and a value, rather than one container with
          `accessibilityRole="adjustable"`. The adjustable trait is the
          textbook answer and it was rejected here: it replaces the two
          buttons with a swipe gesture that only exists inside a screen
          reader, so the pattern has to be right on both platforms at once or
          the control becomes unreachable for the people it was added for.
          Two labelled buttons work identically to TalkBack, VoiceOver and a
          finger, which is the property that matters.
        */}
        <View style={styles.qty}>
          <Pressable
            onPress={decrease}
            accessibilityRole="button"
            accessibilityLabel={
              item.qty === 1
                ? `Remove ${name} from the basket`
                : `Reduce the quantity of ${name}`
            }
            android_ripple={{ color: color.green200 }}
            style={styles.qtyButton}
          >
            {/* U+2212, the minus sign, not a hyphen — it matches the plus in
                width and weight. It needs no hiding: Pressable is `accessible`
                by default, so the glyph is merged into the parent node and the
                label above is what a reader announces. */}
            <Text style={styles.qtyGlyph}>−</Text>
          </Pressable>

          <Text
            style={styles.qtyValue}
            accessibilityLabel={`Quantity ${item.qty}`}
          >
            {item.qty}
          </Text>

          <Pressable
            onPress={increase}
            disabled={atCap}
            accessibilityRole="button"
            accessibilityState={{ disabled: atCap }}
            accessibilityLabel={`Add another ${name}`}
            android_ripple={atCap ? null : { color: color.green200 }}
            style={[styles.qtyButton, atCap && styles.qtyButtonDisabled]}
          >
            <Text style={styles.qtyGlyph}>+</Text>
          </Pressable>
        </View>

        {cappedByStock && (
          <Text style={styles.stockNote}>
            {cap === 0
              ? "The saved catalogue has this pack as out of stock. Checkout reads stock again and will say what is really left."
              : "That is all the saved catalogue has of this pack. Checkout reads stock again."}
          </Text>
        )}

        <Pressable
          onPress={remove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name} from the basket`}
          style={styles.removeTarget}
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>

      <View style={styles.total}>
        <Price paise={item.unitPricePaise * item.qty} size="t17" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.x4,
    paddingVertical: space.x5,
    borderBottomWidth: 1,
    borderBottomColor: color.green200,
  },
  main: { flex: 1, minWidth: 0 },
  titleTarget: { minHeight: space.x11, justifyContent: "center" },
  title: {
    fontFamily: font.display,
    ...typeScale.t20,
    color: color.green900,
  },
  meta: {
    marginTop: space.x1,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  qty: {
    marginTop: space.x3,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    // Clips the Android ripple to the rounded corners, exactly as Button does.
    overflow: "hidden",
  },
  // 44 x 44, from rule 11, and the reason this component exists as its own
  // file: a 32pt "−" is the most common accessibility failure in a mobile
  // cart and it is the kind of thing that gets shaved to fit a layout.
  qtyButton: {
    minWidth: space.x11,
    minHeight: space.x11,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonDisabled: { opacity: 0.4 },
  qtyGlyph: {
    fontFamily: font.body,
    ...typeScale.t20,
    color: color.green900,
  },
  qtyValue: {
    minWidth: space.x8,
    textAlign: "center",
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  stockNote: {
    marginTop: space.x2,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  removeTarget: { minHeight: space.x11, justifyContent: "center" },
  removeText: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
    textDecorationLine: "underline",
  },
  total: { paddingTop: space.x3, alignItems: "flex-end" },
});
