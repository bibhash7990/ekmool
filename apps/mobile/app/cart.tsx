import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import {
  selectCartHydrated,
  selectCartItems,
  selectCartSubtotalPaise,
  selectCouponCode,
} from "@ekmool/core/cart";
import { cartTotals } from "@ekmool/core/shipping";

import { CartLine } from "@/components/cart/CartLine";
import { CartSummary } from "@/components/cart/CartSummary";
import { CouponField } from "@/components/cart/CouponField";
import {
  quoteAdjustments,
  useCouponQuote,
} from "@/components/cart/useCouponQuote";
import { Button, edgesUnderHeader, Eyebrow, Screen, SoilLine } from "@/components/ui";
import { useCatalog } from "@/hooks/useCachedDocument";
import { useAppSelector } from "@/store";
import { color, font, space, type as typeScale } from "@/theme";

/**
 * The basket.
 *
 * ── Where every number comes from ──
 *
 * The lines and the subtotal are the slice's own (`selectCartSubtotalPaise`);
 * delivery, the discount and the total are `cartTotals()` from
 * `@ekmool/core/shipping`, called exactly once, below. **There is no
 * threshold, no flat charge and no total arithmetic anywhere in
 * `apps/mobile/`** — that is the whole reason `shipping.ts` was lifted out of
 * `apps/web/src/lib/constants.ts`. Copying ₹499 and ₹49 into the app would
 * have been quicker and would have meant that the day the owner moves the
 * free-delivery threshold, every installed phone keeps quoting the old one
 * until the store approves a release.
 *
 * Money is formatted with `formatPaise` and nothing else. There is no
 * `Intl.NumberFormat` in this app.
 *
 * ── The total is provisional and the screen says so ──
 *
 * Checkout recomputes every figure inside a transaction that holds a lock on
 * the rows, so the number here is what the customer is shown *while
 * deciding*, never what gets charged. `CartSummary` carries the sentence;
 * `docs/mobile/phase-4-commerce-flows.md` §1 is why it is not optional.
 *
 * ── "We have not looked yet" is not "your basket is empty" ──
 *
 * `selectCartHydrated` is false until the persisted basket has been read off
 * this phone. Rendering the empty state in that window would tell a returning
 * customer their basket had been thrown away, and they would believe it,
 * because it is a perfectly ordinary thing for an app to do.
 */

export default function CartScreen() {
  const hydrated = useAppSelector(selectCartHydrated);
  const items = useAppSelector(selectCartItems);
  const subtotal = useAppSelector(selectCartSubtotalPaise);
  const couponCode = useAppSelector(selectCouponCode);

  // Cache-first and already on the phone in the ordinary case, so this costs
  // a revalidation rather than a wait. It is read for one field — `stockQty`
  // — which the cart line has no other source for: a `CartItem` is a snapshot
  // taken when the pack was added and stock is the part of it that goes off.
  const { data: catalog } = useCatalog();

  // Every hook runs before the two early returns below, which is why this one
  // is here rather than beside the totals it feeds.
  const { quote, busy } = useCouponQuote(couponCode, items);

  const stockByVariant = useMemo(() => {
    const map = new Map<number, number>();
    for (const product of catalog?.products ?? []) {
      for (const variant of product.variants) {
        map.set(variant.id, variant.stockQty);
      }
    }
    return map;
  }, [catalog]);

  const browse = useCallback(() => {
    router.replace("/");
  }, []);

  const checkout = useCallback(() => {
    router.push("/checkout");
  }, []);

  if (!hydrated) {
    // Bounded, unlike the catalogue's cold state: this is one read of the
    // phone's own storage, so it resolves or the app has bigger problems.
    // Deliberately not the empty state — see the header comment.
    return (
      <Screen edges={edgesUnderHeader} contentStyle={styles.content}>
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          Reading your basket…
        </Text>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen scroll edges={edgesUnderHeader} contentStyle={styles.content}>
        <Eyebrow>Your basket</Eyebrow>
        <Text accessibilityRole="header" style={styles.h1}>
          Nothing in it yet.
        </Text>
        <Text style={styles.body}>
          The basket is kept on this phone. Add a pack from any product and it
          stays here, with or without a connection.
        </Text>
        {/* "Shelf", not the web's "shop": that is the word the rest of this
            app already uses for the catalogue — the product screen, the
            not-found screen and the Shop tab all say it. */}
        <View style={styles.actions}>
          <Button onPress={browse} size="lg">
            Browse the shelf
          </Button>
        </View>
      </Screen>
    );
  }

  // The one call. `cartTotals` judges the delivery threshold on the
  // pre-coupon subtotal and clamps a waiver that exceeds the charge — both
  // rules the server applies, neither of them restated here.
  const totals = cartTotals(subtotal, quoteAdjustments(quote));

  return (
    // `Screen`'s own ScrollView rather than one nested inside it: it brings
    // `keyboardShouldPersistTaps="handled"`, without which the first tap on
    // Apply with the keyboard open only dismisses the keyboard and the
    // customer has to press twice.
    <Screen scroll edges={edgesUnderHeader} contentStyle={styles.content}>
      <Eyebrow>Your basket</Eyebrow>
      <Text accessibilityRole="header" style={styles.h1}>
        {items.length} {items.length === 1 ? "line" : "lines"}
      </Text>

      <View style={styles.lines}>
        {items.map((item) => (
          <CartLine
            key={item.variantId}
            item={item}
            stockQty={stockByVariant.get(item.variantId)}
          />
        ))}
      </View>

      <SoilLine />

      <CartSummary
        totals={totals}
        couponField={
          <CouponField code={couponCode} quote={quote} busy={busy} />
        }
      />

      <View style={styles.actions}>
        <Button onPress={checkout} size="lg" style={styles.checkout}>
          Checkout
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Horizontal padding comes from `Screen`'s gutter, which is the web's
  // `px-5`. Only the vertical rhythm is set here.
  content: {
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
  // Full width, as the web's `w-full` on the checkout button. The primary
  // action on a phone should not need aiming for.
  checkout: { flexGrow: 1 },
});
