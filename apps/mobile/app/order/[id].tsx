import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { itemAdded } from "@ekmool/core/cart";
import { formatPaise } from "@ekmool/core/money";
import {
  orderStatusLabel,
  type OrderStatus,
  type PaymentStatus,
} from "@ekmool/core/order-status";

import {
  cancelOrder,
  getOrder,
  getReorderQuote,
  invoiceUrl,
  requestReturn,
  RETURN_REASON_OPTIONS,
  type OrderDetail,
} from "@/api/account";
import { Button, Eyebrow, Screen, SoilLine, edgesUnderHeader } from "@/components/ui";
import { useAppDispatch } from "@/store";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * One order: where it is, what was in it, and what can still be done about
 * it.
 *
 * **The status vocabulary comes from `@ekmool/core/order-status`.** Neither
 * client writes its own strings for the six statuses, which is the mechanism
 * that stops the site and the phone naming the same state differently — the
 * reason that module was moved out of `apps/web` in the first place.
 *
 * **Money is `formatPaise` from `@ekmool/core/money`, everywhere.** There is
 * no `Intl.NumberFormat` for currency in this app and no arithmetic on the
 * totals: every figure below is a field the server sent, printed. The one
 * addition is the discount, and it is the server's own per-line allocation
 * summed, not a discount this screen worked out.
 *
 * What this screen deliberately does **not** have, with the reason:
 *
 *  - **No timeline.** The web draws one from `order_status_history`;
 *    `GET /api/orders/[id]` does not send it. Inventing a timeline out of the
 *    current status would draw dated steps that never happened.
 *  - **No street address and no phone number.** The route omits them and
 *    sends the city, state and PIN. The ULID is the only credential it asks
 *    for, so a forwarded link must not hand over more than is on the parcel.
 *  - **No invoice rendered natively.** See `invoiceUrl` in `src/api/account.ts`.
 */

/**
 * Which statuses a customer may still call off themselves. After packing
 * they cannot, and the server enforces it — this only decides whether to
 * offer the control, so nobody is invited to press a button that will refuse.
 */
const CANCELLABLE: ReadonlySet<string> = new Set<OrderStatus>([
  "pending",
  "confirmed",
]);

/**
 * Payment wording.
 *
 * A copy of the map in `apps/web/src/app/orders/[id]/page.tsx`, and a copy
 * for the same reason the return reasons are: `PaymentStatus` is a type in
 * `@ekmool/core/order-status` but its labels are not, so there is nothing to
 * import. `ORDER_STATUS_LABEL` next door is exactly the shape this wants.
 * **Moving `PAYMENT_STATUS_LABEL` into that module is the fix**, and it is a
 * two-line change to a file this task does not own.
 */
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Awaiting payment",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

/** IST everywhere, `en-IN` everywhere — docs/DESIGN-SYSTEM.md. */
const ORDER_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/**
 * The heading, which is a sentence about where the order is.
 *
 * **"Waiting to be sent" is the design system's own example of this rule** —
 * say what happens next, and never thank somebody for an order that has not
 * moved. The web currently prints "On its way to you." for everything that is
 * neither delivered nor cancelled, which is true of `shipped` and is not true
 * of `pending`, `confirmed` or `packed`: nothing has left the building. This
 * screen splits them. The web page is the one that should follow.
 *
 * `pending` is separated again because it means one specific thing here:
 * `createOrder` writes `confirmed` for Cash on Delivery and `pending` for an
 * online payment that the webhook has not confirmed yet. So a pending order
 * is not waiting on the packing bench, it is waiting on money, and
 * `ORDER_STATUS_LABEL` already calls it "Awaiting payment".
 */
function heading(status: OrderStatus): string {
  if (status === "cancelled") return "This order was cancelled.";
  if (status === "delivered") return "Delivered.";
  if (status === "shipped") return "On its way to you.";
  if (status === "pending") return "Waiting for your payment.";
  return "Waiting to be sent.";
}

function reference(id: string): string {
  return id.slice(-8).toUpperCase();
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : ORDER_DATE.format(date);
}

/* ------------------------------------------------------------------ */

export default function OrderScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  // A repeated parameter arrives as an array. Take the first rather than
  // joining, which would look up an order nobody placed.
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const dispatch = useAppDispatch();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);

  /** A refusal or a confirmation from an action, printed where it happened. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "cancel" | "reorder" | "return">(null);

  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState(
    RETURN_REASON_OPTIONS[0]?.value ?? "",
  );
  const [returnDetail, setReturnDetail] = useState("");
  const [returnFieldError, setReturnFieldError] = useState<string | null>(null);
  const [returnSent, setReturnSent] = useState(false);
  const [reorderNotes, setReorderNotes] = useState<string[] | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      const result = await getOrder(id, { signal });
      if (signal?.aborted) return;
      if (result.ok) {
        setOrder(result.data);
        setLoadFailure(null);
        return;
      }
      if (result.code === "CANCELLED") return;
      setLoadFailure(result.message);
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /* ---------------- actions ---------------- */

  const doCancel = useCallback(async () => {
    if (!id || busy !== null) return;
    setBusy("cancel");
    setActionError(null);

    const result = await cancelOrder(id);
    setBusy(null);
    setConfirmingCancel(false);

    if (!result.ok) {
      setActionError(result.message);
      AccessibilityInfo.announceForAccessibility(result.message);
      return;
    }
    // Re-read rather than patching `status` locally. Cancelling also moves
    // the payment status and the stock, and a screen that guessed at half the
    // consequences would be showing a state the database is not in.
    await load();
    AccessibilityInfo.announceForAccessibility("This order is cancelled.");
  }, [busy, id, load]);

  const doReorder = useCallback(async () => {
    if (!id || busy !== null) return;
    setBusy("reorder");
    setActionError(null);
    setReorderNotes(null);

    const result = await getReorderQuote(id);
    setBusy(null);

    if (!result.ok) {
      setActionError(result.message);
      return;
    }

    const { available, unavailable } = result.data;

    for (const line of available) {
      // Built field by field rather than spread: the cart slice's shape is
      // the contract and `reducedFrom` is presentation for this screen only.
      dispatch(
        itemAdded({
          variantId: line.variantId,
          sku: line.sku,
          productSlug: line.productSlug,
          productName: line.productName,
          packLabel: line.packLabel,
          unitPricePaise: line.unitPricePaise,
          mrpPaise: line.mrpPaise,
          accent: line.accent,
          qty: line.qty,
        }),
      );
    }

    const notes = [
      ...unavailable.map((line) => `${line.label} — ${line.reason}`),
      ...available
        .filter((line) => line.reducedFrom !== null)
        .map(
          (line) =>
            `${line.productName} · ${line.packLabel} — only ${line.qty} left, so we added that many instead of ${line.reducedFrom}.`,
        ),
    ];

    if (available.length === 0) {
      setReorderNotes(
        notes.length > 0
          ? notes
          : ["Nothing from this order is available at the moment."],
      );
      return;
    }

    if (notes.length > 0) {
      // Stay on the screen so the reasons can be read, with the basket
      // already updated. Sending them to the basket would hide the note
      // behind a navigation they did not ask for.
      setReorderNotes(notes);
      return;
    }

    router.push("/cart");
  }, [busy, dispatch, id]);

  const doReturn = useCallback(async () => {
    if (!id || busy !== null) return;
    setBusy("return");
    setActionError(null);
    setReturnFieldError(null);

    const result = await requestReturn(id, returnReason, returnDetail);
    setBusy(null);

    if (result.ok) {
      setReturnOpen(false);
      setReturnSent(true);
      setReturnDetail("");
      AccessibilityInfo.announceForAccessibility(
        "Your return request has been sent. We reply to every request.",
      );
      return;
    }

    if (result.code === "VALIDATION_FAILED") {
      // The only field that can fail is the detail — the reason comes from a
      // fixed list — so the message goes next to the box rather than into the
      // banner at the top of the section.
      setReturnFieldError(result.message);
      return;
    }

    setActionError(result.message);
    setReturnOpen(false);
  }, [busy, id, returnDetail, returnReason]);

  const openInvoice = useCallback(async () => {
    if (!id) return;
    // A Custom Tab on Android and SFSafariViewController on iOS: the
    // customer stays inside the app's task, gets the platform's own print and
    // share affordances, and the page they see is the same one the web
    // prints. No session travels with it and none is needed — the invoice
    // route asks for the ULID and nothing else.
    await WebBrowser.openBrowserAsync(invoiceUrl(id), {
      toolbarColor: color.paper,
      controlsColor: color.green900,
    });
  }, [id]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/orders");
  }, []);

  /* ---------------- derived ---------------- */

  const discountPaise = useMemo(
    () =>
      // The server's own per-line allocation, added up. Not a discount this
      // screen worked out: `order_items.discount_paise` is the share of the
      // order discount the checkout transaction assigned to that line, and
      // the sum of the shares is the discount.
      order?.items.reduce((sum, item) => sum + item.discountPaise, 0) ?? 0,
    [order],
  );

  /* ---------------- not loaded ---------------- */

  if (!order) {
    return (
      <Screen edges={edgesUnderHeader}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.h1}>
            {loadFailure === null ? "Fetching your order…" : "Not loaded."}
          </Text>
          {loadFailure !== null && (
            <>
              <Text style={styles.body}>{loadFailure}</Text>
              <View style={styles.actions}>
                <Button onPress={() => void load()}>Try again</Button>
                <Button variant="secondary" onPress={goBack}>
                  Your orders
                </Button>
              </View>
            </>
          )}
        </ScrollView>
      </Screen>
    );
  }

  const prepaid = order.paymentStatus === "paid";
  const canCancel = CANCELLABLE.has(order.status) && !prepaid;
  const isCod = order.paymentMethod === "cod";
  // An invoice exists for anything actually supplied. A pending order has
  // been paid for by nobody yet, and a cancelled one supplied nothing.
  const hasInvoice = order.status !== "pending" && order.status !== "cancelled";

  return (
    <Screen edges={edgesUnderHeader}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* One string, not `Order #{...}` — Eyebrow takes a string rather
            than a node so that it, and not the caller, owns the face and the
            tracking. */}
        <Eyebrow>{`Order #${reference(order.id)}`}</Eyebrow>
        <Text accessibilityRole="header" style={styles.h1}>
          {heading(order.status)}
        </Text>
        <Text style={styles.meta}>
          Placed {formatDate(order.createdAt)} · {orderStatusLabel(order.status)}
        </Text>

        {order.trackingId !== null && (
          <View style={styles.notice}>
            <Text style={styles.noticeStrong}>
              Tracking number {order.trackingId}
            </Text>
            <Text style={styles.noticeText}>
              The first courier scan can take a few hours to appear — that is
              normal.
            </Text>
          </View>
        )}

        <SoilLine />

        {/* ---------- What was in it ---------- */}
        <Eyebrow heading>What you ordered</Eyebrow>
        <View style={styles.lines}>
          {order.items.map((item) => (
            <View key={item.sku} style={styles.line}>
              <View style={styles.lineMain}>
                <Text style={styles.lineTitle}>{item.productName}</Text>
                <Text style={styles.lineMeta}>
                  {item.packSizeLabel} × {item.qty}
                </Text>
              </View>
              <Text style={styles.lineTotal}>
                {formatPaise(item.lineTotalPaise)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <Row label="Subtotal" value={formatPaise(order.subtotalPaise)} />
          {discountPaise > 0 && (
            <Row label="Discount" value={`−${formatPaise(discountPaise)}`} />
          )}
          <Row
            label="Shipping"
            value={
              order.shippingPaise === 0 ? "Free" : formatPaise(order.shippingPaise)
            }
          />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPaise(order.totalPaise)}</Text>
          </View>
        </View>

        <SoilLine />

        {/* ---------- Where and how ---------- */}
        <Eyebrow heading>Delivering to</Eyebrow>
        <Text style={styles.address}>
          {order.customerFirstName}
          {"\n"}
          {order.deliverTo.city}, {order.deliverTo.state}{" "}
          {order.deliverTo.pincode}
        </Text>

        <Text style={styles.subhead}>Payment</Text>
        <Text style={styles.body}>
          {isCod ? "Cash on Delivery" : "Paid online"} ·{" "}
          {PAYMENT_STATUS_LABEL[order.paymentStatus]}
        </Text>
        {isCod && order.status !== "cancelled" && (
          <Text style={styles.note}>
            Please keep {formatPaise(order.totalPaise)} ready for the courier.
          </Text>
        )}

        <SoilLine />

        {/* ---------- What can be done ---------- */}
        {actionError !== null && (
          <View accessibilityLiveRegion="assertive" role="alert" style={styles.refusal}>
            <Text style={styles.refusalText}>{actionError}</Text>
          </View>
        )}

        {order.status === "cancelled" ? (
          <Text style={styles.body}>
            Nothing was dispatched and the stock went back on sale. If this was
            not you, or you would like it back, get in touch from the Contact
            page on ekmool.in and we will sort it out.
          </Text>
        ) : canCancel ? (
          confirmingCancel ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>Cancel this order for good?</Text>
              <Text style={styles.confirmBody}>
                We put the stock straight back on sale, so it cannot be undone
                — you would need to order again.
              </Text>
              <View style={styles.actionsTight}>
                <Button
                  variant="secondary"
                  onPress={() => void doCancel()}
                  disabled={busy !== null}
                >
                  {busy === "cancel" ? "Cancelling…" : "Yes, cancel it"}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => setConfirmingCancel(false)}
                  disabled={busy !== null}
                >
                  Keep my order
                </Button>
              </View>
            </View>
          ) : (
            // Two taps, not one. The destructive action is never the thing
            // under a customer's thumb when they arrive on the screen.
            <View style={styles.actionsTight}>
              <Button variant="ghost" onPress={() => setConfirmingCancel(true)}>
                Cancel this order
              </Button>
            </View>
          )
        ) : prepaid && CANCELLABLE.has(order.status) ? (
          <Text style={styles.body}>
            This order has been paid, so cancelling it means issuing a refund.
            Contact us from ekmool.in and we will cancel and refund it for you.
          </Text>
        ) : order.status === "delivered" ? null : (
          <Text style={styles.body}>
            This order has already been packed, so it can no longer be
            cancelled here. Get in touch from ekmool.in if something needs
            changing.
          </Text>
        )}

        {/* ---------- Return ---------- */}
        {order.status === "delivered" && (
          <View style={styles.block}>
            {returnSent ? (
              <View accessibilityLiveRegion="polite" style={styles.notice}>
                <Text style={styles.noticeStrong}>Return requested</Text>
                <Text style={styles.noticeText}>
                  We have your request and will reply shortly. The full rules
                  are on the refund policy page.
                </Text>
              </View>
            ) : returnOpen ? (
              <ReturnForm
                reason={returnReason}
                onReason={setReturnReason}
                detail={returnDetail}
                onDetail={(value) => {
                  setReturnDetail(value);
                  setReturnFieldError(null);
                }}
                fieldError={returnFieldError}
                busy={busy === "return"}
                onSubmit={() => void doReturn()}
                onCancel={() => setReturnOpen(false)}
              />
            ) : (
              // Offered on any delivered order. Whether the window is still
              // open, and whether a return is already running, is decided by
              // `createReturnRequest` — the server knows the delivery date and
              // this response does not carry it. A refusal comes back with the
              // server's own sentence, including the days remaining.
              <View style={styles.actionsTight}>
                <Button variant="ghost" onPress={() => setReturnOpen(true)}>
                  Something wrong with this order?
                </Button>
              </View>
            )}
          </View>
        )}

        {/* ---------- Re-order, invoice ---------- */}
        <View style={styles.actions}>
          <Button
            variant="secondary"
            onPress={() => void doReorder()}
            disabled={busy !== null}
          >
            {busy === "reorder" ? "Adding…" : "Order this again"}
          </Button>
          {hasInvoice && (
            <Button
              variant="ghost"
              onPress={() => void openInvoice()}
              accessibilityHint="Opens the invoice in your browser"
            >
              View invoice
            </Button>
          )}
        </View>

        {reorderNotes !== null && (
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeStrong}>
              Added what we could. A note on the rest:
            </Text>
            {reorderNotes.map((note) => (
              <Text key={note} style={styles.noticeText}>
                · {note}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Button variant="ghost" onPress={goBack}>
            All your orders
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * The return form is a rendering of /refund-policy, not a free-text
 * complaint box: each reason carries its own window and its own caveat, so a
 * customer reads what applies to their case before they type rather than
 * writing three paragraphs and being told afterwards that opened food cannot
 * go back.
 */
function ReturnForm({
  reason,
  onReason,
  detail,
  onDetail,
  fieldError,
  busy,
  onSubmit,
  onCancel,
}: {
  reason: string;
  onReason: (value: string) => void;
  detail: string;
  onDetail: (value: string) => void;
  fieldError: string | null;
  busy: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const selected = RETURN_REASON_OPTIONS.find((option) => option.value === reason);

  return (
    <View style={styles.returnForm}>
      <Text accessibilityRole="header" style={styles.subhead}>
        Tell us what went wrong
      </Text>

      <View accessibilityRole="radiogroup" style={styles.reasons}>
        {RETURN_REASON_OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onReason(option.value)}
            // radio, not button: these are one choice among several, and a
            // reader that announces "button" for each gives no clue that
            // picking one unpicks the others.
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === option.value }}
            accessibilityLabel={option.label}
            android_ripple={{ color: color.green200 }}
            style={[
              styles.reason,
              reason === option.value && styles.reasonSelected,
            ]}
          >
            <Text style={styles.reasonLabel}>{option.label}</Text>
            <Text style={styles.reasonWindow}>
              Within{" "}
              {option.windowHours <= 48
                ? `${option.windowHours} hours`
                : `${option.windowHours / 24} days`}{" "}
              of delivery
            </Text>
          </Pressable>
        ))}
      </View>

      {selected && <Text style={styles.note}>{selected.help}</Text>}

      <Text style={styles.label}>What happened?</Text>
      <TextInput
        value={detail}
        onChangeText={onDetail}
        multiline
        numberOfLines={4}
        maxLength={1000}
        editable={!busy}
        accessibilityLabel="What happened?"
        accessibilityHint={
          fieldError ?? "A sentence is enough. At least ten characters."
        }
        aria-invalid={fieldError !== null}
        placeholderTextColor={color.green700}
        style={[styles.textarea, fieldError !== null && styles.inputInvalid]}
      />
      <Text style={fieldError !== null ? styles.fieldError : styles.fieldHint}>
        {fieldError ?? "A sentence is enough. At least ten characters."}
      </Text>

      <View style={styles.actionsTight}>
        <Button onPress={onSubmit} disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
        <Button variant="ghost" onPress={onCancel} disabled={busy}>
          Never mind
        </Button>
      </View>

      <Text style={styles.note}>
        The full rules are on the refund policy page on ekmool.in. We reply to
        every request.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.x5,
    paddingTop: space.x6,
    paddingBottom: space.x16,
  },
  h1: {
    marginTop: space.x4,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  meta: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  subhead: {
    marginTop: space.x8,
    fontFamily: font.display,
    ...typeScale.t20,
    color: color.green900,
  },
  body: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  note: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  address: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
  },
  lines: {
    marginTop: space.x5,
    borderTopWidth: 1,
    borderTopColor: color.green200,
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.x4,
    paddingVertical: space.x4,
    borderBottomWidth: 1,
    borderBottomColor: color.green200,
  },
  lineMain: { flex: 1, minWidth: 0 },
  lineTitle: {
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  lineMeta: {
    marginTop: space.x1,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  lineTotal: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t17,
    color: color.green900,
  },
  totals: { marginTop: space.x5 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.x4,
    paddingVertical: space.x1_5,
  },
  rowLabel: {
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  rowValue: {
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
  },
  totalRow: {
    marginTop: space.x2,
    paddingTop: space.x2_5,
    borderTopWidth: 1,
    borderTopColor: color.green200,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.x4,
  },
  totalLabel: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t20,
    color: color.green900,
  },
  totalValue: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t20,
    color: color.green900,
  },
  notice: {
    marginTop: space.x6,
    backgroundColor: color.gold100,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderRadius: radius.sm,
  },
  noticeStrong: {
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  noticeText: {
    marginTop: space.x1_5,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green900,
  },
  refusal: {
    marginBottom: space.x5,
    borderWidth: 1,
    borderColor: color.terracotta,
    borderRadius: radius.sm,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  },
  refusalText: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.terracotta,
  },
  confirm: {
    marginTop: space.x2,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.cream,
    paddingHorizontal: space.x4,
    paddingVertical: space.x4,
  },
  confirmTitle: {
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  confirmBody: {
    marginTop: space.x1_5,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  block: { marginTop: space.x6 },
  actions: {
    marginTop: space.x7,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x4,
  },
  actionsTight: {
    marginTop: space.x4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x3,
  },
  returnForm: {
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.cream,
    paddingHorizontal: space.x4,
    paddingVertical: space.x4,
  },
  reasons: {
    marginTop: space.x4,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: color.paper,
  },
  reason: {
    minHeight: space.x14, // comfortably past the 44pt floor for a list row
    justifyContent: "center",
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderBottomWidth: 1,
    borderBottomColor: color.green200,
  },
  // Marked by a field change AND by accessibilityState above — never by
  // colour alone.
  reasonSelected: { backgroundColor: color.gold100 },
  reasonLabel: {
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  reasonWindow: {
    marginTop: space.x1,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  label: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  textarea: {
    marginTop: space.x2,
    minHeight: space.x16,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.paper,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
    textAlignVertical: "top",
  },
  inputInvalid: { borderColor: color.terracotta },
  fieldHint: {
    marginTop: space.x1_5,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  fieldError: {
    marginTop: space.x1_5,
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    color: color.terracotta,
  },
});
