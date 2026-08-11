import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { formatPaise } from "@ekmool/core/money";
import { isOrderStatus, orderStatusLabel } from "@ekmool/core/order-status";

import { Button, edgesUnderHeader, Eyebrow, Screen, SoilLine } from "@/components/ui";
import { color, font, space, type as typeScale } from "@/theme";

/**
 * The receipt: what was just placed, what happens next, and a way back.
 *
 * **It makes no network request, deliberately.** Everything on this screen
 * came out of the `POST /api/checkout` reply the previous screen already
 * holds, which is the server's own answer about this order — the recomputed
 * total, the status it was created with, the id. Fetching `GET
 * /api/orders/[id]` to draw the same facts would put a request between the
 * customer and their confirmation at the one moment the app must not fail,
 * and it is exactly the moment a connection is most likely to be poor: a
 * phone that just managed one round trip on a train has no obligation to
 * manage a second. Order *tracking* is a different screen with a different
 * job, and that one reads live.
 *
 * **Nothing here is invented.** The status is verified against
 * `@ekmool/core/order-status` before it is named, so the two clients call the
 * same state the same thing; an unrecognised value is simply not printed
 * rather than shown raw. If the screen is reached without the totals — a deep
 * link, a cold start on a saved URL — it prints the reference and the "what
 * happens next" that is true of every order, and says nothing it cannot
 * source. A confirmation that guesses is worse than one that is short.
 *
 * There is **no offer to create an account** at the end. Rule 7: there is no
 * registration and there must never be one. The reference plus the email is
 * the whole credential, and the copy says so.
 */

/** The last 8 characters, upper-cased — the same reference the web prints. */
function reference(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function ReceiptScreen() {
  const params = useLocalSearchParams<{
    id: string | string[];
    status?: string | string[];
    totalPaise?: string | string[];
  }>();

  const orderId = firstParam(params.id);

  // Validated, not trusted. A route parameter is whatever is in the URL, and
  // the status vocabulary belongs to `@ekmool/core/order-status` — a phone
  // that printed `params.status` straight through would be the client that
  // invents a seventh status the day someone deep-links a typo.
  const rawStatus = firstParam(params.status);
  const status = isOrderStatus(rawStatus) ? rawStatus : null;

  const rawTotal = Number(firstParam(params.totalPaise));
  const totalPaise =
    Number.isSafeInteger(rawTotal) && rawTotal >= 0 ? rawTotal : null;

  const goHome = useCallback(() => {
    // `replace`, not `push`. The stack behind this screen is the checkout
    // form for an order that has already been placed, and there must be no
    // way back into it.
    router.replace("/");
  }, []);

  return (
    <Screen gutter={false} edges={edgesUnderHeader}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Eyebrow takes a string, not a node — see the note in its own
            file: React Native cannot render bare text outside a <Text>, so
            the component owns the type rather than the caller. */}
        <Eyebrow>{`Order #${reference(orderId)}`}</Eyebrow>

        <Text accessibilityRole="header" style={styles.h1}>
          Your order is placed.
        </Text>

        <Text style={styles.lead}>
          {totalPaise !== null
            ? `Keep ${formatPaise(totalPaise)} ready for the courier. We pack within one working day.`
            : "We pack within one working day, and you pay the courier when it arrives."}
        </Text>

        {status !== null && (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status</Text>
            {/* The vocabulary comes from the shared module so the app and the
                site name the same state the same way. "Waiting to be sent"
                beats "Thank you for your order" when it has not been sent. */}
            <Text style={styles.statusValue}>{orderStatusLabel(status)}</Text>
          </View>
        )}

        <SoilLine />

        <View style={styles.section}>
          <Eyebrow heading>What happens next</Eyebrow>
          <Text style={styles.step}>
            1 · A confirmation email is on its way to the address you gave.
          </Text>
          <Text style={styles.step}>
            2 · We mill and pack your order within one working day.
          </Text>
          <Text style={styles.step}>
            3 · You get a tracking link the moment it ships.
          </Text>
        </View>

        <View style={styles.section}>
          <Eyebrow heading>Keep this reference</Eyebrow>
          <Text style={styles.referenceValue}>#{reference(orderId)}</Text>
          <Text style={styles.body}>
            This reference and the email you used are all you ever need to
            reach this order. There is no account and no password.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button size="lg" onPress={goHome}>
            Back to the shelf
          </Button>
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
  lead: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t20,
    color: color.green700,
  },
  statusRow: {
    marginTop: space.x6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.x3,
  },
  statusLabel: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  statusValue: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t17,
    color: color.green900,
  },
  section: {
    marginTop: space.x8,
  },
  step: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  referenceValue: {
    marginTop: space.x4,
    fontFamily: font.display,
    ...typeScale.t26,
    color: color.green900,
  },
  body: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  actions: {
    marginTop: space.x10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x4,
  },
});
