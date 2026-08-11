import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import { formatPaise } from "@ekmool/core/money";
import { orderStatusLabel } from "@ekmool/core/order-status";

import {
  listAccountOrders,
  type AccountOrderSummary,
} from "@/api/account";
import { signOut } from "@/api/session";
import { Button, Eyebrow, Screen, SoilLine } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * Order history.
 *
 * **Scoped by the email inside the bearer token and by nothing else.** There
 * is no parameter on `GET /api/account/orders` and this screen has no way to
 * ask for somebody else's orders even if it wanted to — docs/SECURITY.md,
 * "scope every read to the session, never to a parameter".
 *
 * **`FlatList`, where the plan says FlashList.** That is a deliberate
 * deferral, recorded here so the next reader does not file it as an
 * oversight: FlashList is a new dependency and rule 12 says to ask first; the
 * owner was asked and declined it for this change. The list is unbounded in
 * principle, which is the argument for FlashList, and in practice a customer
 * of a five-product shop has tens of orders, not thousands. `FlatList` with a
 * fixed row height and `getItemLayout` recycles well enough at that size. If
 * the histories ever get long enough to drop frames, that is the measurement
 * to bring back with the request.
 *
 * The three states this screen has are all real screens, not spinners over an
 * empty page: not signed in (a door, never a registration form), signed in
 * with nothing yet, and signed in with orders.
 */

/** IST everywhere, `en-IN` everywhere — docs/DESIGN-SYSTEM.md. */
const ORDER_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/**
 * One row is two lines of copy and the rule under them, at a fixed height so
 * the list has an even rhythm at any text size the row can hold. Nothing in
 * the row wraps: the reference is eight characters and the meta line is
 * `numberOfLines={1}`.
 *
 * There is deliberately **no `getItemLayout`**, even though the height is
 * constant. Its `offset` has to include the list header, this header is
 * paragraph copy whose height depends on the address length and the system
 * text scale, and an offset that is wrong by the header's height sends
 * `scrollToIndex` and the initial scroll restoration to the wrong place. A
 * measured list of tens of rows costs nothing; a confidently wrong offset
 * costs a scroll position.
 */
const ROW_HEIGHT = 84;

function formatDate(iso: string): string {
  const date = new Date(iso);
  // A malformed date from a bad deploy shows as the raw string rather than
  // "Invalid Date", which reads like a bug in the customer's order.
  return Number.isNaN(date.getTime()) ? iso : ORDER_DATE.format(date);
}

function reference(id: string): string {
  // The eight characters printed on the confirmation — the tail of the ULID,
  // exactly as the web's OrderList slices it.
  return id.slice(-8).toUpperCase();
}

function OrderRow({ order }: { order: AccountOrderSummary }) {
  const open = useCallback(() => {
    router.push({ pathname: "/order/[id]", params: { id: order.id } });
  }, [order.id]);

  const items = `${order.itemCount} item${order.itemCount === 1 ? "" : "s"}`;
  const status = orderStatusLabel(order.status);

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      // One spoken sentence for the whole row. Without it a screen reader
      // reads four disconnected fragments and the customer has to assemble
      // the order themselves.
      accessibilityLabel={`Order ${reference(order.id)}, ${formatDate(order.createdAt)}, ${items}, ${status}, ${formatPaise(order.totalPaise)}`}
      accessibilityHint="Opens the order"
      android_ripple={{ color: color.green200 }}
      style={styles.row}
    >
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>#{reference(order.id)}</Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {formatDate(order.createdAt)} · {items} · {status}
        </Text>
      </View>
      <Text style={styles.rowTotal}>{formatPaise(order.totalPaise)}</Text>
    </Pressable>
  );
}

export default function OrdersScreen() {
  const { session } = useSession();
  const signedIn = session.status === "signed-in";

  const [orders, setOrders] = useState<AccountOrderSummary[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const result = await listAccountOrders({ signal });
      if (signal?.aborted) return;
      if (result.ok) {
        setOrders(result.data);
        setFailure(null);
        return;
      }
      // CANCELLED is this screen unmounting, not something to report.
      if (result.code === "CANCELLED") return;
      // A 401 has already cleared the keystore inside the API client, and the
      // session subscription will swap this screen for the door — so there is
      // nothing to print, and printing it would flash an error on the way.
      if (result.code === "NO_SESSION") return;
      setFailure(result.message);
    },
    [],
  );

  useEffect(() => {
    if (!signedIn) {
      setOrders(null);
      setFailure(null);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, signedIn]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const openDoor = useCallback(() => {
    router.push("/sign-in");
  }, []);

  const forgetThisPhone = useCallback(() => {
    void signOut();
  }, []);

  /* ---------------- reading the keystore ---------------- */

  if (session.status === "loading") {
    return (
      <Screen>
        <View style={styles.content}>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Checking this phone…
          </Text>
        </View>
      </Screen>
    );
  }

  /* ---------------- the door ---------------- */

  if (session.status === "signed-out") {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>Your orders</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            Find your order.
          </Text>

          <SoilLine />

          <Text style={styles.body}>
            There is no account to sign into and no password to remember. Give
            us the reference from your confirmation and the email you ordered
            with, and everything you have bought from us is there.
          </Text>
          <Text style={styles.body}>
            It works for orders placed on ekmool.in as well as in the app —
            they are the same orders.
          </Text>

          <View style={styles.actions}>
            <Button size="lg" onPress={openDoor}>
              Find my order
            </Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  /* ---------------- signed in ---------------- */

  const header = (
    <View style={styles.listHeader}>
      <Eyebrow>Your orders</Eyebrow>
      <Text accessibilityRole="header" style={styles.h1}>
        Order history.
      </Text>
      <Text style={styles.body}>
        Everything placed with {session.email}. An order placed with a
        different address lives under that one — look it up and it becomes the
        account this phone is signed in to.
      </Text>

      {failure !== null && (
        <View accessibilityLiveRegion="polite" role="alert" style={styles.failure}>
          <Text style={styles.failureText}>{failure}</Text>
        </View>
      )}
    </View>
  );

  const footer = (
    <View style={styles.listFooter}>
      <SoilLine />
      <View style={styles.actions}>
        <Button
          variant="secondary"
          onPress={() => router.push("/account/addresses")}
        >
          Saved addresses
        </Button>
        <Button variant="secondary" onPress={() => router.push("/account/privacy")}>
          Your data
        </Button>
      </View>
      <View style={styles.actions}>
        <Button
          variant="ghost"
          onPress={forgetThisPhone}
          accessibilityHint="Deletes the sign-in from this phone. Your orders are not affected."
        >
          Sign out of this phone
        </Button>
      </View>
      <Text style={styles.note}>
        Signing out deletes the token stored on this phone and nothing else.
        Your orders stay where they are, and the same reference and email will
        find them again.
      </Text>
    </View>
  );

  if (orders === null) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          {failure === null ? (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              Fetching your orders…
            </Text>
          ) : (
            // The reason is already printed in the header, next to the
            // heading. Repeating it here would be the same sentence twice on
            // one screen.
            <View style={styles.actions}>
              <Button onPress={refresh}>Try again</Button>
            </View>
          )}
        </ScrollView>
      </Screen>
    );
  }

  return (
    // Default gutter, and the list's own content padding on top of it — the
    // same doubling every other screen in this app has (product, cart,
    // saved). Matching it is deliberate: a single screen that is 20pt
    // narrower than the four around it reads as a mistake, and fixing the
    // gutter properly is a change to `Screen` and to every caller.
    <Screen>
      <FlatList
        data={orders}
        keyExtractor={(order) => order.id}
        renderItem={({ item }) => <OrderRow order={item} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.body}>No orders against this address yet.</Text>
            <View style={styles.actions}>
              <Button onPress={() => router.replace("/")}>
                Browse the shelf
              </Button>
            </View>
          </View>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            // The pull-to-refresh spinner is the one place the brand's accent
            // is a fill on a light ground, which gold-500 is allowed to be.
            colors={[color.gold500]}
            tintColor={color.green700}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.x5,
    paddingTop: space.x6,
    paddingBottom: space.x16,
  },
  listContent: {
    paddingHorizontal: space.x5,
    paddingTop: space.x6,
    paddingBottom: space.x16,
  },
  listHeader: { marginBottom: space.x6 },
  listFooter: { marginTop: space.x8 },
  h1: {
    marginTop: space.x5,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  body: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x4,
    borderBottomWidth: 1,
    borderBottomColor: color.green200,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: font.display,
    ...typeScale.t20,
    color: color.green900,
  },
  rowMeta: {
    marginTop: space.x1,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  rowTotal: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t17,
    color: color.green900,
  },
  empty: { paddingTop: space.x2 },
  actions: {
    marginTop: space.x7,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x4,
  },
  failure: {
    marginTop: space.x6,
    borderWidth: 1,
    borderColor: color.terracotta,
    borderRadius: radius.sm,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  },
  failureText: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.terracotta,
  },
  note: {
    marginTop: space.x6,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
});
