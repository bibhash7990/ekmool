import { useCallback } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import {
  itemRemoved,
  qtySet,
  selectCartHydrated,
  selectCartItems,
  selectCartSubtotalPaise,
  type CartItem,
} from "@ekmool/core/cart";
import { formatPaise } from "@ekmool/core/money";

import { Button, Eyebrow, Price, Screen, SoilLine } from "@/components/ui";
import { useAppDispatch, useAppSelector } from "@/store";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * The basket.
 *
 * **Every number here comes from `@ekmool/core`.** The line totals and the
 * subtotal are `selectCartSubtotalPaise` and the reducer's own arithmetic —
 * not re-added here — because the web and the phone quoting different
 * amounts for the same basket is the failure the shared package exists to
 * prevent, and it is a failure nobody notices until a customer does.
 *
 * **Only the subtotal.** Shipping (free above a threshold, flat below) and
 * coupon arithmetic live in `apps/web/src/lib/constants.ts` and behind the
 * quote endpoint; neither is in a shared package yet. Copying ₹499 and ₹49
 * into this file to draw a prettier summary would put a promise about
 * delivery charges in the app that no shared constant governs, and the day
 * the owner changes it the phone would keep quoting the old one. So the
 * screen shows what it can source and says plainly where the rest is
 * decided.
 *
 * There is no checkout button and no disabled one. Phase 4 adds checkout;
 * a greyed-out button is a promise with a date attached to it.
 */

const MAX_QTY_PER_LINE = 10; // mirrors the reducer's own clamp

function Line({ item }: { item: CartItem }) {
  const dispatch = useAppDispatch();

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

  return (
    <View style={styles.line}>
      <View style={styles.lineMain}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${item.productName}, ${item.packLabel}`}
          accessibilityHint="Opens the product"
          style={styles.lineTitleTarget}
        >
          <Text style={styles.lineTitle}>{item.productName}</Text>
        </Pressable>
        <Text style={styles.lineMeta}>
          {item.packLabel} · {formatPaise(item.unitPricePaise)} each
        </Text>

        <View style={styles.qty}>
          <Pressable
            onPress={decrease}
            accessibilityRole="button"
            accessibilityLabel={`Reduce ${item.productName}, ${item.packLabel}`}
            android_ripple={{ color: color.green200 }}
            style={styles.qtyButton}
          >
            <Text style={styles.qtyGlyph}>−</Text>
          </Pressable>
          <Text style={styles.qtyValue} accessibilityLabel={`Quantity ${item.qty}`}>
            {item.qty}
          </Text>
          <Pressable
            onPress={increase}
            disabled={item.qty >= MAX_QTY_PER_LINE}
            accessibilityRole="button"
            accessibilityState={{ disabled: item.qty >= MAX_QTY_PER_LINE }}
            accessibilityLabel={`Add another ${item.productName}, ${item.packLabel}`}
            android_ripple={{ color: color.green200 }}
            style={[
              styles.qtyButton,
              item.qty >= MAX_QTY_PER_LINE && styles.qtyButtonDisabled,
            ]}
          >
            <Text style={styles.qtyGlyph}>+</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={remove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.productName}, ${item.packLabel} from the basket`}
          style={styles.removeTarget}
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>

      <View style={styles.lineTotal}>
        <Price paise={item.unitPricePaise * item.qty} />
      </View>
    </View>
  );
}

export default function CartScreen() {
  const hydrated = useAppSelector(selectCartHydrated);
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartSubtotalPaise);

  const browse = useCallback(() => {
    router.replace("/");
  }, []);

  if (!hydrated) {
    // Bounded, unlike the catalogue's cold state: this is one read of the
    // phone's own storage, so it resolves or the app has bigger problems.
    return (
      <Screen>
        <View style={styles.content}>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Reading your basket…
          </Text>
        </View>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>Your basket</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            Nothing in it yet.
          </Text>
          <Text style={styles.body}>
            The basket is kept on this phone. Add a pack from any product and
            it stays here, with or without a connection.
          </Text>
          <View style={styles.actions}>
            <Button onPress={browse}>Browse the shelf</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Your basket</Eyebrow>
        <Text accessibilityRole="header" style={styles.h1}>
          {items.length} {items.length === 1 ? "line" : "lines"}
        </Text>

        <View style={styles.lines}>
          {items.map((item) => (
            <Line key={item.variantId} item={item} />
          ))}
        </View>

        <SoilLine />

        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Price paise={subtotal} />
        </View>

        <Text style={styles.body}>
          Delivery charges, any code you hold and the tax breakdown are worked
          out at checkout, where the prices and stock are read live rather than
          from the copy on this phone.
        </Text>

        <View style={styles.aside}>
          <Text style={styles.asideText}>
            You cannot check out from the app yet — that arrives in the next
            release. Until then the basket stays on this phone, and nothing in
            it has been sent anywhere.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.x5,
    paddingTop: space.x6,
    paddingBottom: space.x16,
  },
  h1: {
    marginTop: space.x5,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  lines: {
    marginTop: space.x8,
    borderTopWidth: 1,
    borderTopColor: color.green200,
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.x4,
    paddingVertical: space.x5,
    borderBottomWidth: 1,
    borderBottomColor: color.green200,
  },
  lineMain: { flex: 1, minWidth: 0 },
  lineTitleTarget: { minHeight: space.x11, justifyContent: "center" },
  lineTitle: {
    fontFamily: font.display,
    ...typeScale.t20,
    color: color.green900,
  },
  lineMeta: {
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
  },
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
  removeTarget: { minHeight: space.x11, justifyContent: "center" },
  removeText: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
    textDecorationLine: "underline",
  },
  lineTotal: { paddingTop: space.x3, alignItems: "flex-end" },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x4,
    paddingVertical: space.x3,
  },
  summaryLabel: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t20,
    color: color.green900,
  },
  body: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  actions: {
    marginTop: space.x7,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.x4,
  },
  aside: {
    marginTop: space.x8,
    borderLeftWidth: 2,
    borderLeftColor: color.gold500,
    paddingLeft: space.x4,
  },
  asideText: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
});
