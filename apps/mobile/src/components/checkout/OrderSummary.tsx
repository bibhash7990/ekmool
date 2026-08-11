import { StyleSheet, Text, View } from "react-native";

import type { CartItem } from "@ekmool/core/cart";
import { formatPaise } from "@ekmool/core/money";
import type { CartTotals } from "@ekmool/core/shipping";

import type { CouponQuote } from "@/api/coupons";
import { SummaryRow, SummaryValue } from "@/components/cart/CartSummary";
import { Button, Eyebrow, Price } from "@/components/ui";
import { color, font, hairline, space, type } from "@/theme";

/**
 * What the order costs, as far as this phone can honestly say.
 *
 * **Every figure comes from `@ekmool/core`.** `cartTotals` does the
 * arithmetic — once, on the screen, so the number on the Place Order button
 * and the number on the Total row cannot be two different answers — and
 * `formatPaise` does the formatting. There is no `+`, no threshold and no
 * `Intl.NumberFormat` in this file. That is the whole reason those modules
 * were moved into a shared package: the web and the phone quoting different
 * delivery charges for the same basket is a failure nobody notices until a
 * customer does, and they cannot tell which of the two numbers is the lie.
 *
 * **The rows come from the basket screen's `SummaryRow`.** They were written
 * out again here once, and the result was the bug this file was rewritten to
 * fix: the cart said ₹450 and checkout said ₹500 for the same basket, because
 * the two summaries were separately maintained and only one of them knew what
 * the coupon was worth. Sharing the row is what makes "the same basket reads
 * the same on both screens" a property of the code rather than of somebody
 * remembering.
 *
 * **And it is provisional, which the copy says out loud.** The checkout
 * transaction recomputes every price from rows it holds a lock on, so this is
 * the number a customer is shown *while deciding*, not the number that gets
 * charged. What leaves this screen is variant ids, quantities, an address and
 * a bare coupon code — never a price, a discount or a total. The receipt shows
 * the server's answer.
 */

export type OrderSummaryProps = {
  items: readonly CartItem[];
  /**
   * From the screen's single `cartTotals(subtotal, quoteAdjustments(quote))`.
   * Nothing is re-added, re-subtracted or clamped here.
   */
  totals: CartTotals;
  /** The code the customer holds, if any. */
  couponCode: string | null;
  /**
   * What the shop last said that code is worth against this basket, or null
   * while the first answer is outstanding. `granted`, `refused` and
   * `unchecked` are three different sentences and the difference matters —
   * see the block that renders them.
   */
  quote: CouponQuote | null;
  /** A preview is in flight for the basket on screen right now. */
  busy: boolean;
  /**
   * Drops the code from the order. Offered only on a refusal, and it is an
   * offer rather than a requirement: a refused code grants nothing, so the
   * order can be placed with it still attached and the server will simply
   * refuse it again. Nothing about a coupon may block an order.
   */
  onDropCoupon: () => void;
};

export function OrderSummary({
  items,
  totals,
  couponCode,
  quote,
  busy,
  onDropCoupon,
}: OrderSummaryProps) {
  return (
    <View style={styles.summary}>
      <Eyebrow heading>Order summary</Eyebrow>

      <View style={styles.lines}>
        {items.map((item) => (
          <View key={item.variantId} style={styles.line}>
            <View style={styles.lineMain}>
              <Text style={styles.lineName}>{item.productName}</Text>
              <Text style={styles.lineMeta}>
                {item.packLabel} × {item.qty}
              </Text>
            </View>
            <Text style={styles.lineTotal}>
              {formatPaise(item.unitPricePaise * item.qty)}
            </Text>
          </View>
        ))}
      </View>

      <SummaryRow
        label="Subtotal"
        spoken={formatPaise(totals.subtotalPaise)}
        value={<Price paise={totals.subtotalPaise} size="t17" />}
      />

      {/*
        Shown only when a discount was actually granted. A "Discount −₹0" row
        while the preview is still in flight would be a figure presented as
        settled, and a customer who saw it would have no way to know it was a
        placeholder.

        The row says "Discount" and not "Discount · SAVE50", which the web
        checkout does — here the code is named in the sentence under the total
        instead, so the two mobile screens read identically and a screen
        reader is not handed a middot to pronounce.
      */}
      {totals.discountPaise > 0 && (
        <SummaryRow
          label="Discount"
          spoken={`${formatPaise(totals.discountPaise)} off`}
          value={<SummaryValue>−{formatPaise(totals.discountPaise)}</SummaryValue>}
        />
      )}

      {/*
        "Shipping", the word the basket screen and both web pages use. This
        row said "Delivery" until the two screens were reconciled; one label
        for the same charge is worth more than the better word.
      */}
      <SummaryRow
        label="Shipping"
        spoken={
          totals.shippingPaise === 0 ? "free" : formatPaise(totals.shippingPaise)
        }
        value={
          totals.shippingPaise === 0 ? (
            <SummaryValue>Free</SummaryValue>
          ) : (
            <Price paise={totals.shippingPaise} size="t17" />
          )
        }
      />

      <SummaryRow
        emphasis
        label="Total"
        spoken={formatPaise(totals.totalPaise)}
        value={<Price paise={totals.totalPaise} size="t20" />}
      />

      {couponCode !== null && (
        <CouponStatus
          code={couponCode}
          quote={quote}
          busy={busy}
          onDrop={onDropCoupon}
        />
      )}

      <Text style={styles.note}>
        Prices and delivery are worked out again when the order is placed,
        from the shop&rsquo;s own records rather than the copy on this phone.
      </Text>
    </View>
  );
}

/**
 * What the applied code is doing to the total above, in one sentence.
 *
 * The three states are three different truths and collapsing any pair of them
 * is a lie a customer can act on:
 *
 *  - **granted** — the discount is in the Total row, and the sentence is the
 *    shop's own description of the offer.
 *  - **refused** — the discount is not in the total and should not be. The
 *    sentence is the one the server composed, because it had the coupon row
 *    and could name the threshold ("That code needs a basket of at least
 *    ₹500"); this file never writes a refusal of its own. The order can still
 *    be placed, with or without the code.
 *  - **unchecked** — nobody looked. Offline, or the database is down. The
 *    total therefore does not include the discount, because inventing one
 *    would be a guess shown as a fact — but the sentence says plainly that
 *    the code is still on the order and that the shop applies it, because
 *    dropping it silently would tell a customer with a perfectly good code
 *    that it had been refused. `apps/mobile/src/api/coupons.ts` is where that
 *    state is constructed and why it exists.
 *
 * The wording deliberately tracks `components/cart/CouponField.tsx`: the
 * basket says "the code stays on the basket and checkout decides", and here —
 * where checkout *is* the next thing that happens — it says the shop applies
 * it when the order is placed. A customer moving between the two screens
 * should hear the same stance in the same words, not two different postures
 * towards the same code.
 */
function CouponStatus({
  code,
  quote,
  busy,
  onDrop,
}: {
  code: string;
  quote: CouponQuote | null;
  busy: boolean;
  onDrop: () => void;
}) {
  return (
    // One live region for every outcome rather than a region per branch, as
    // the coupon field does: a reader should hear the answer once, whichever
    // answer it is.
    <View accessibilityLiveRegion="polite" style={styles.coupon}>
      {busy && (
        <Text style={styles.couponQuiet}>
          Checking what {code} takes off…
        </Text>
      )}

      {!busy && quote?.status === "granted" && (
        <Text style={styles.couponQuiet}>
          {quote.description}
          {quote.shippingWaivedPaise > 0 &&
            ` — delivery on us (${formatPaise(quote.shippingWaivedPaise)})`}
        </Text>
      )}

      {!busy && quote?.status === "refused" && (
        <>
          <Text style={styles.couponRefused}>{quote.message}</Text>
          <View style={styles.couponAction}>
            {/*
              An offer, not a gate. The Place Order button beside it stays
              enabled — the total above already excludes the discount, so
              placing the order as it stands charges exactly what is shown.
              This only saves the round trip where the server refuses the code
              again and the customer reads the same sentence twice.
            */}
            <Button variant="secondary" onPress={onDrop}>
              Place it without the code
            </Button>
          </View>
        </>
      )}

      {!busy && quote?.status === "unchecked" && (
        <Text style={styles.couponQuiet}>
          {quote.message} {code} stays on this order and the shop applies it
          when the order is placed — so the total above does not include it
          yet, and the receipt may be lower.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    marginTop: space.x8,
  },
  lines: {
    marginTop: space.x5,
    marginBottom: space.x3,
    borderTopWidth: hairline,
    borderTopColor: color.green200,
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.x4,
    paddingVertical: space.x3_5,
    borderBottomWidth: hairline,
    borderBottomColor: color.green200,
  },
  lineMain: { flex: 1, minWidth: 0 },
  lineName: {
    fontFamily: font.bodyMedium,
    ...type.t17,
    color: color.green900,
  },
  lineMeta: {
    marginTop: space.x1,
    fontFamily: font.body,
    ...type.t15,
    color: color.green700,
  },
  lineTotal: {
    fontFamily: font.body,
    ...type.t17,
    color: color.green900,
  },
  coupon: {
    marginTop: space.x3,
  },
  couponQuiet: {
    fontFamily: font.body,
    ...type.t15,
    color: color.green700,
  },
  // Terracotta is the palette's error ink and clears 4.5:1 on paper. It is
  // not the only signal: the sentence itself names the rule that refused.
  couponRefused: {
    fontFamily: font.body,
    ...type.t15,
    color: color.terracotta,
  },
  couponAction: {
    marginTop: space.x3,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  note: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...type.t15,
    color: color.green700,
  },
});
