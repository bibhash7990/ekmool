import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatPaise } from "@ekmool/core/money";
import type { CartTotals } from "@ekmool/core/shipping";

import { Price } from "@/components/ui";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * Subtotal, discount, delivery, total — the web's order summary, in the same
 * order and with the same words.
 *
 * **Every figure is read off `CartTotals` and none is computed here.** The
 * arithmetic is `cartTotals()` in `@ekmool/core/shipping`, called once on the
 * screen; this component receives the answer. There is no threshold, no flat
 * charge and no subtraction in this file, and that is the point — ₹499 and
 * ₹49 typed into the app would keep being quoted for as long as it took
 * somebody to notice the site had changed them.
 *
 * Money is formatted with `formatPaise` only. There is no `Intl.NumberFormat`
 * in `apps/mobile/`.
 *
 * ── Why there is a second summary, and what the two share ──
 *
 * `components/checkout/OrderSummary.tsx` renders the same four money rows and
 * they must look and read identically, so the row itself is `SummaryRow`
 * below and checkout imports it. Everything around the rows genuinely
 * differs, which is why the two were not collapsed into one component: the
 * cart owns the coupon *field* and the free-delivery nudge (an invitation to
 * add another pack, which at checkout would ask a customer mid-form to go
 * back and shop), checkout owns a read-only recap of the lines the cart draws
 * as interactive steppers and sits under its own heading, and the Cash on
 * Delivery footnote below repeats a Payment section that checkout already
 * shows two blocks higher. One component serving both would need four flags
 * to switch those off, and a component configured into two shapes is two
 * components with extra steps.
 */

export type CartSummaryProps = {
  totals: CartTotals;
  /** Rendered under the total. The coupon field lives here on the web too. */
  couponField: ReactNode;
};

export type SummaryRowProps = {
  label: string;
  value: ReactNode;
  /** What the value reads as. Given because `value` is a node, not a string. */
  spoken: string;
  emphasis?: boolean;
};

/**
 * One row of the summary, read as a single unit by a screen reader.
 *
 * The web writes this as a `<dl>`, where the pairing is in the markup. React
 * Native has no description list, so the pairing is made explicitly: without
 * `accessible`, TalkBack stops on "Subtotal" and then on "₹1,299" as two
 * unrelated pieces of text, and a customer swiping through the summary hears
 * four labels and four numbers in no stated relationship.
 *
 * Exported because the checkout summary draws the same rows and a customer
 * moving from the basket to checkout must not see the type, the spacing or
 * the reading order change under them. It lives here rather than in
 * `components/ui/` because it is the cart's row and not a design-system
 * primitive — the same reason the web keeps `useCouponQuote` in
 * `components/cart/` and imports it from `components/checkout/`.
 */
export function SummaryRow({
  label,
  value,
  spoken,
  emphasis = false,
}: SummaryRowProps) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${spoken}`}
      style={[styles.row, emphasis && styles.rowTotal]}
    >
      <Text style={[styles.label, emphasis && styles.labelTotal]}>{label}</Text>
      {value}
    </View>
  );
}

/**
 * A summary value that is a word or a sign rather than a price — "Free",
 * "−₹450". Exported alongside `SummaryRow` for the same reason: the discount
 * and shipping cells are the two that are not a `Price`, and they are the two
 * most likely to drift in weight or colour between the two screens if each
 * file spells the style out for itself.
 */
export function SummaryValue({ children }: { children: ReactNode }) {
  return <Text style={styles.value}>{children}</Text>;
}

export function CartSummary({ totals, couponField }: CartSummaryProps) {
  const {
    subtotalPaise,
    discountPaise,
    shippingPaise,
    totalPaise,
    remainingForFreePaise,
  } = totals;

  return (
    <View style={styles.summary}>
      <SummaryRow
        label="Subtotal"
        spoken={formatPaise(subtotalPaise)}
        value={<Price paise={subtotalPaise} size="t17" />}
      />

      {discountPaise > 0 && (
        <SummaryRow
          label="Discount"
          spoken={`${formatPaise(discountPaise)} off`}
          value={<SummaryValue>−{formatPaise(discountPaise)}</SummaryValue>}
        />
      )}

      <SummaryRow
        label="Shipping"
        spoken={shippingPaise === 0 ? "free" : formatPaise(shippingPaise)}
        value={
          shippingPaise === 0 ? (
            <SummaryValue>Free</SummaryValue>
          ) : (
            <Price paise={shippingPaise} size="t17" />
          )
        }
      />

      <SummaryRow
        emphasis
        label="Total"
        spoken={formatPaise(totalPaise)}
        value={<Price paise={totalPaise} size="t20" />}
      />

      {couponField}

      {remainingForFreePaise > 0 && (
        <View style={styles.nudge}>
          <Text style={styles.nudgeText}>
            Add {formatPaise(remainingForFreePaise)} more for free shipping.
          </Text>
        </View>
      )}

      {/*
        The honest sentence about the numbers above, and it is not optional.
        `docs/mobile/phase-4-commerce-flows.md` §1: the displayed total is
        provisional and must not pretend otherwise — checkout recomputes every
        figure from rows it holds a lock on, and `docs/SECURITY.md` says never
        to trust a client-sent price, discount or total. The design system's
        "say what happens next" is the other half of it. Saying nothing would
        not make the total more accurate, only less honest about being a
        working-out rather than a bill.
      */}
      <Text style={styles.provisional}>
        This is worked out on your phone from the prices it has saved. Checkout
        reads the prices, the stock and any code again from the shop, and that
        total is the one you pay.
      </Text>

      <Text style={styles.footNote}>
        Cash on Delivery available across India. Taxes included.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: space.x6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x4,
    minHeight: space.x11,
    paddingVertical: space.x1_5,
  },
  rowTotal: {
    marginTop: space.x1,
    borderTopWidth: 1,
    borderTopColor: color.green200,
    paddingTop: space.x3,
  },
  label: {
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  labelTotal: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t20,
    color: color.green900,
  },
  value: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t17,
    color: color.green900,
  },
  nudge: {
    marginTop: space.x4,
    backgroundColor: color.gold100,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderRadius: radius.sm,
  },
  nudgeText: {
    fontFamily: font.body,
    ...typeScale.t15,
    // green-900 on gold-100, not gold-800 on gold-100. Both clear 4.5:1; the
    // green is the design system's ink and the gold is the ground it sits on.
    color: color.green900,
  },
  provisional: {
    marginTop: space.x6,
    borderLeftWidth: 2,
    borderLeftColor: color.gold500,
    paddingLeft: space.x4,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  footNote: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
});
