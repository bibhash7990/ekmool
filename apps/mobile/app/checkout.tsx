import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { TextInput } from "react-native";
import { router } from "expo-router";

import type { CatalogDocument } from "@ekmool/contracts/documents";
import type { ServiceabilityResultResponse } from "@ekmool/contracts/responses";
import {
  cartCleared,
  couponCleared,
  itemRemoved,
  qtySet,
  selectCartHydrated,
  selectCartItems,
  selectCartSubtotalPaise,
  selectCouponCode,
  type CartItem,
} from "@ekmool/core/cart";
import { formatPaise } from "@ekmool/core/money";
import { cartTotals } from "@ekmool/core/shipping";

import { CATALOG_DOCUMENT } from "@/api/documents";
import type { ApiFailure } from "@/api/client";
import {
  couponRefusalReason,
  fieldErrorsFromIssues,
  insufficientStockDetail,
  newIdempotencyKey,
  placeCodOrder,
  validationIssues,
  type CheckoutDraft,
} from "@/api/checkout";
import { checkServiceability, deliveryBand } from "@/api/serviceability";
import {
  quoteAdjustments,
  useCouponQuote,
} from "@/components/cart/useCouponQuote";
import { Field } from "@/components/checkout/Field";
import { Notice } from "@/components/checkout/Notice";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { StateField } from "@/components/checkout/StateField";
import { Button, edgesUnderHeader, Eyebrow, Screen, SoilLine } from "@/components/ui";
import { readCachedDocument } from "@/lib/document-cache";
import { apiGet } from "@/api/client";
import { loadSession } from "@/lib/session";
import { useAppDispatch, useAppSelector } from "@/store";
import { color, font, space, type as typeScale } from "@/theme";

/**
 * Checkout. Guest, Cash on Delivery, one screen.
 *
 * **There is no sign-in step and no "continue as guest" button.** Rule 7, and
 * the phrasing is the point: a button offering to continue as a guest tells a
 * customer an account exists that they are declining, which is not true here
 * — there is no registration and there must never be one. A returning
 * customer who has a session from `/track` gets their saved address filled in
 * because the session already earns that; a customer without one types their
 * address, and nothing on this screen suggests they should have done
 * otherwise.
 *
 * **Cash on Delivery only, in this change.** No payment SDK is in the
 * binary. `placeCodOrder` writes `paymentMethod` itself, so there is no path
 * from this screen that can ask for a payment window that does not exist.
 *
 * **The server is the authority on every number.** What is sent is variant
 * ids, quantities, an address and — if the customer holds one — a coupon
 * code. No price, no discount, no total. The checkout transaction recomputes
 * all of it from rows it holds a lock on, which is why the summary above the
 * button says the shop prices it again.
 *
 * **The total here is the total the basket showed.** This screen mounts the
 * same `useCouponQuote` the cart mounts and feeds its answer through the same
 * `cartTotals`, which is the only place in `apps/mobile/` this arithmetic
 * happens. It did not, once: the cart showed ₹450 with a code applied and
 * this screen showed ₹500 for the same basket, because it called `cartTotals`
 * with no adjustments and left the discount to be a surprise on the receipt.
 * A total that moves between the basket and the button is the fastest way to
 * lose an order, and the customer cannot tell which of the two numbers was
 * the lie. The web keeps the two pages honest the same way — one hook, both
 * screens (`apps/web/src/components/checkout/CheckoutForm.tsx`).
 */

/* ------------------------------------------------------------------ */
/* Form state                                                          */

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  notes: "",
};

type FormField = keyof typeof EMPTY_FORM;

/**
 * The order the fields appear in, so "focus the first thing that is wrong"
 * means the first one on screen rather than the first one Zod happened to
 * complain about. Zod reports in schema order, which is close but not the
 * same — `notes` is declared before `couponCode` and after the address.
 */
const FIELD_ORDER: readonly FormField[] = [
  "name",
  "email",
  "phone",
  "line1",
  "line2",
  "city",
  "state",
  "pincode",
  "landmark",
  "notes",
];

/* ------------------------------------------------------------------ */
/* Refusals                                                            */

/**
 * Every documented refusal from `POST /api/checkout` has a state here, and
 * none of them is an `Alert.alert`. See the note on `Notice`.
 */
type Refusal =
  | { kind: "stock"; message: string; sku: string; available: number }
  | { kind: "coupon"; message: string }
  | { kind: "unknownVariant"; message: string }
  /** Rate limits, the database being unreachable, a 500, a dropped connection. */
  | { kind: "plain"; message: string }
  /** The outcome of acting on a refusal — "the code has been removed". */
  | { kind: "info"; message: string };

/**
 * Whether the phone can be *shown* to have no connection.
 *
 * There is no network-state module in this app and adding one is a
 * dependency (rule 12), so the state below is inferred from evidence rather
 * than observed: a request that failed with `OFFLINE` is proof, a request
 * that succeeded is proof of the opposite, and before either has happened the
 * honest answer is that we do not know. `unknown` therefore leaves Place
 * Order **enabled** — disabling a button on a guess refuses an order from a
 * customer who is perfectly online, which is a worse failure than the one it
 * would be guarding against.
 *
 * In practice the PIN code lookup runs before anyone reaches the button and
 * settles this, which is why that call is worth having on the same screen
 * quite apart from the delivery estimate it fetches.
 */
type Reachability = "unknown" | "reachable" | "offline";

const OFFLINE_REASON =
  "You are offline — this needs a connection. Nothing has been sent.";

/* ------------------------------------------------------------------ */
/* Prefill                                                             */

interface DefaultAddressResponse {
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
    landmark: string;
  } | null;
  customer?: { name: string; email: string; phone: string };
}

/* ------------------------------------------------------------------ */
/* Serviceability                                                      */

/** Six digits, first not zero — the same shape `addressSchema` accepts. */
const PINCODE = /^[1-9]\d{5}$/;

/*
 * The two numeric fields normalise as they are typed, and neither uses
 * `maxLength`.
 *
 * That looks like an oversight and is the opposite. React Native applies
 * `maxLength` **before** `onChangeText` sees the value, so a customer pasting
 * "+91 98765 43210" into a field capped at ten characters hands this code
 * "+91 98765 ", which strips to "9198765" — a wrong number, silently, from an
 * action that should have worked. The same paste of "560 001" into a
 * six-character PIN field yields "56000". Clamping after the strip instead
 * costs nothing and gets both right; typing is unaffected, because an
 * eleventh digit is discarded either way.
 *
 * The schemas are not relaxed to meet the input. `phoneSchema` still demands
 * ten digits starting 6-9 and the server still enforces it — this only makes
 * the keyboard produce what the contract already asked for.
 */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // 12 digits beginning 91 is the country code somebody pasted. It cannot be
  // a valid national number: `phoneSchema` requires a first digit of 6-9.
  const national =
    digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return national.slice(0, 10);
}

function normalisePincode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

/**
 * Long enough that typing six digits is one lookup rather than four, short
 * enough that the answer is on screen before the finger reaches the next
 * field. Debounced on the value, not on the keystroke, so a paste is one call.
 */
const PINCODE_DEBOUNCE_MS = 400;

/* ------------------------------------------------------------------ */

export default function CheckoutScreen() {
  const dispatch = useAppDispatch();
  const hydrated = useAppSelector(selectCartHydrated);
  const items = useAppSelector(selectCartItems);
  const subtotalPaise = useAppSelector(selectCartSubtotalPaise);
  const couponCode = useAppSelector(selectCouponCode);

  /*
   * The same question the basket asked, asked again here.
   *
   * There is no cross-screen cache and deliberately so — the basket can be
   * edited from the refusal panel below, and a coupon can be exhausted by
   * somebody else between the two screens, so the answer that was true on the
   * cart is not automatically true on the button. The hook keys its answer to
   * the basket it answered for, so a stale quote is never shown beside a
   * changed basket; while the first answer is outstanding the discount is
   * simply not in the total, exactly as on the cart, and the summary says it
   * is checking rather than showing a figure it has not been given. This is
   * what the web does on both of its pages, for the same reasons.
   */
  const { quote, busy: quoting } = useCouponQuote(couponCode, items);

  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [placing, setPlacing] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [reachability, setReachability] = useState<Reachability>("unknown");
  const [service, setService] = useState<ServiceabilityResultResponse | null>(null);
  const [probe, setProbe] = useState(0);

  /**
   * True from the moment an order is placed until this screen unmounts.
   *
   * The cart is emptied on success, which would otherwise re-render this
   * screen as "there is nothing to check out" for the frame or two before
   * the navigation lands — telling a customer their basket is empty at
   * exactly the moment they have bought its contents.
   */
  const [placed, setPlaced] = useState(false);

  const inputs = useRef<Partial<Record<FormField, TextInput | null>>>({});

  /**
   * One key per attempt, minted on the first tap and held.
   *
   * Cleared only when the server has told us nothing was created — see
   * `keepKeyFor` below. Kept when the outcome is unknown, which is the whole
   * reason it exists.
   */
  const idempotencyKey = useRef<string | null>(null);

  /* ---------------- prefill ---------------- */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Asked only when there is a token. The endpoint answers
      // `{ address: null }` with no database work for a guest, but a guest
      // should not spend a request on a phone bill to be told they have no
      // saved address — and the absence of the call is also the absence of
      // any suggestion that having one would have been better.
      const session = await loadSession();
      if (cancelled || !session) return;

      const result = await apiGet<DefaultAddressResponse>(
        "/api/account/default-address",
      );
      if (cancelled || !result.ok || !result.data.address) return;

      const saved = result.data.address;
      const customer = result.data.customer;

      setForm((current) => {
        const next = { ...current };
        // Only fills what is still empty. Prefill arriving after somebody has
        // started typing must never overwrite what they typed.
        const fill = (field: FormField, value: string | undefined) => {
          if (next[field] === "" && value) next[field] = value;
        };
        fill("name", customer?.name);
        fill("email", customer?.email);
        fill("phone", customer?.phone);
        fill("line1", saved.line1);
        fill("line2", saved.line2);
        fill("city", saved.city);
        fill("state", saved.state);
        fill("pincode", saved.pincode);
        fill("landmark", saved.landmark);
        return next;
      });
      setPrefilled(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- serviceability ---------------- */

  useEffect(() => {
    const pincode = form.pincode;
    if (!PINCODE.test(pincode)) {
      setService(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void checkServiceability(pincode, { signal: controller.signal }).then(
        (result) => {
          if (controller.signal.aborted) return;
          if (result.ok) {
            setService(result.data);
            setReachability("reachable");
            return;
          }
          // An estimate is information, not a gate: a lookup that failed
          // removes the estimate and changes nothing else. The only thing
          // worth keeping from the failure is what it proves about the
          // connection.
          setService(null);
          if (result.code === "OFFLINE") setReachability("offline");
        },
      );
    }, PINCODE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `probe` is a dependency so "Try again" re-runs the same lookup rather
    // than merely re-enabling the button on the customer's word.
  }, [form.pincode, probe]);

  /* ---------------- editing ---------------- */

  const update = useCallback((field: FormField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const setState = useCallback(
    (value: string) => {
      update("state", value);
    },
    [update],
  );

  /* ---------------- placing the order ---------------- */

  const applyValidationFailure = useCallback((failure: ApiFailure) => {
    const issues = validationIssues(failure);
    const fieldErrors = fieldErrorsFromIssues(issues);
    setErrors(fieldErrors);

    const firstBad = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (firstBad) {
      // `state` is a Pressable rather than a TextInput and cannot take focus;
      // the announcement below still names the count, and the field carries
      // its own message.
      inputs.current[firstBad]?.focus();
    }

    const count = Object.keys(fieldErrors).length;
    AccessibilityInfo.announceForAccessibility(
      count === 1
        ? "One field needs correcting."
        : `${count} fields need correcting.`,
    );

    return count;
  }, []);

  const onFailure = useCallback(
    (failure: ApiFailure) => {
      switch (failure.code) {
        case "VALIDATION_FAILED": {
          const count = applyValidationFailure(failure);
          setRefusal(
            count > 0
              ? null
              : // A 422 whose issues we could not read. The server's sentence
                // is still better than silence.
                { kind: "plain", message: failure.message },
          );
          return;
        }

        case "INSUFFICIENT_STOCK": {
          const detail = insufficientStockDetail(failure);
          setRefusal(
            detail
              ? {
                  kind: "stock",
                  message: failure.message,
                  sku: detail.sku,
                  available: detail.available,
                }
              : { kind: "plain", message: failure.message },
          );
          return;
        }

        case "COUPON_REFUSED": {
          // The reason is read but not turned into a sentence here: the
          // server composed one from the reason *and its threshold* ("a
          // basket of at least ₹500"), which is information this client does
          // not have. `couponRefusalReason` is what decides that a "remove
          // the code" control makes sense at all.
          const reason = couponRefusalReason(failure);
          setRefusal(
            reason
              ? { kind: "coupon", message: failure.message }
              : { kind: "plain", message: failure.message },
          );
          return;
        }

        case "UNKNOWN_VARIANT":
          setRefusal({ kind: "unknownVariant", message: failure.message });
          return;

        case "RAZORPAY_NOT_CONFIGURED":
          /*
           * Unreachable while `placeCodOrder` is the only way out of this
           * screen — it writes `paymentMethod: "cod"` itself, and the server
           * only sends this code for `"razorpay"`.
           *
           * The branch exists anyway because the day online payment is added
           * this is the fallback the phase document asks for: drop back to
           * Cash on Delivery in place, and log it. It is already Cash on
           * Delivery, so "in place" costs nothing today; what it buys is that
           * the fallback is written down before the code path that needs it,
           * rather than after a customer has met the gap.
           */
          console.warn(
            "[checkout] RAZORPAY_NOT_CONFIGURED from a Cash on Delivery order — the server and this client disagree about what was sent",
          );
          setRefusal({
            kind: "info",
            message:
              "Online payment is not available. This order is Cash on Delivery — try placing it again.",
          });
          return;

        default:
          // `DB_UNAVAILABLE` ("Nothing has been charged.") and `RATE_LIMITED`
          // (the wait, in words, from `retryAfterMessage`) both land here and
          // both already carry the right sentence. Composing our own would
          // replace copy that knows the threshold with copy that does not.
          setRefusal({ kind: "plain", message: failure.message });
      }
    },
    [applyValidationFailure],
  );

  const submit = useCallback(async () => {
    if (placing) return;
    setRefusal(null);

    const draft: CheckoutDraft = {
      customer: { name: form.name, email: form.email, phone: form.phone },
      address: {
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        landmark: form.landmark,
      },
      items: items.map((item) => ({ variantId: item.variantId, qty: item.qty })),
      notes: form.notes,
      // The code and nothing else. What it is worth is decided against a
      // locked row in the checkout transaction.
      couponCode: couponCode ?? "",
    };

    idempotencyKey.current ??= newIdempotencyKey();
    const key = idempotencyKey.current;

    setPlacing(true);
    const result = await placeCodOrder(draft, key);

    if (result.ok) {
      /*
       * A replay — 200 with `replayed: true` — is treated as plain success
       * and the customer is told nothing. It means their earlier attempt did
       * reach the shop and this one returned that same order instead of
       * creating a second. That is the mechanism working, not news.
       */
      idempotencyKey.current = null;
      setPlaced(true);
      dispatch(cartCleared());
      router.replace({
        pathname: "/receipt/[id]",
        params: {
          id: result.data.orderId,
          status: result.data.status,
          totalPaise: String(result.data.totalPaise),
        },
      });
      return;
    }

    /*
     * Whether the next tap is a retry or a fresh attempt.
     *
     * Keep the key whenever the outcome is *unknown* — a dropped connection,
     * a timeout, a 503, a 500 — because the request may have committed before
     * the answer got lost, and the same key turns the next tap into a replay
     * of that order rather than a second one.
     *
     * Clear it for every refusal the server reached a decision on. Those
     * rolled the transaction back, so nothing was created; and the customer
     * is about to change the order (reduce a quantity, drop a code, fix a
     * field), which makes the next tap a genuinely different attempt. Reusing
     * the key across an edit is the one way this mechanism can hurt: if the
     * first attempt *had* committed, the edited one would silently return the
     * old order.
     */
    const keepKey =
      result.code === "OFFLINE" ||
      result.code === "TIMEOUT" ||
      result.code === "CANCELLED" ||
      result.code === "DB_UNAVAILABLE" ||
      result.code === "INTERNAL_ERROR";
    if (!keepKey) idempotencyKey.current = null;

    if (result.code === "OFFLINE") {
      setReachability("offline");
    } else if (result.code !== "TIMEOUT" && result.code !== "CANCELLED") {
      // Anything with a status code came from the server, so the phone is on
      // a network whatever else went wrong.
      setReachability("reachable");
    }

    onFailure(result);
    setPlacing(false);
  }, [couponCode, dispatch, form, items, onFailure, placing]);

  /* ---------------- acting on a refusal ---------------- */

  const reduceToAvailable = useCallback(
    (item: CartItem, available: number) => {
      if (available <= 0) {
        dispatch(itemRemoved(item.variantId));
        setRefusal({
          kind: "info",
          message: `${item.productName}, ${item.packLabel} has been taken out of your basket.`,
        });
        return;
      }
      dispatch(qtySet({ variantId: item.variantId, qty: available }));
      setRefusal({
        kind: "info",
        message: `${item.productName} is now ${available} in your basket. The order can be placed.`,
      });
    },
    [dispatch],
  );

  const dropCoupon = useCallback(() => {
    dispatch(couponCleared());
    setRefusal({
      kind: "info",
      message:
        "That code has been removed. The order can be placed without it, at the prices shown.",
    });
  }, [dispatch]);

  const removeLine = useCallback(
    (item: CartItem) => {
      dispatch(itemRemoved(item.variantId));
      setRefusal({
        kind: "info",
        message: `${item.productName}, ${item.packLabel} has been taken out of your basket.`,
      });
    },
    [dispatch],
  );

  const retryConnection = useCallback(() => {
    setReachability("unknown");
    setRefusal(null);
    setProbe((n) => n + 1);
  }, []);

  /* ---------------- the states before the form ---------------- */

  if (placed) {
    // Checked before the empty-basket branch below, and that ordering is the
    // whole reason `placed` exists: the cart is emptied on success, so
    // without this the screen would render "there is nothing to check out"
    // for the frame between the order landing and the receipt appearing.
    return (
      <Screen edges={edgesUnderHeader}>
        <View style={styles.plain}>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Your order is placed. Opening your receipt…
          </Text>
        </View>
      </Screen>
    );
  }

  if (!hydrated) {
    return (
      <Screen edges={edgesUnderHeader}>
        <View style={styles.plain}>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Reading your basket…
          </Text>
        </View>
      </Screen>
    );
  }

  if (items.length === 0) {
    return (
      <Screen edges={edgesUnderHeader}>
        <View style={styles.plain}>
          <Text accessibilityRole="header" style={styles.h1}>
            There is nothing to check out.
          </Text>
          <Text style={styles.body}>
            Your basket is empty. Add a pack from any product and it stays on
            this phone until you come back.
          </Text>
          <View style={styles.actions}>
            <Button onPress={() => router.replace("/")}>Browse the shelf</Button>
          </View>
        </View>
      </Screen>
    );
  }

  // The one call, and the same one the cart makes. `cartTotals` judges the
  // delivery threshold on the pre-coupon subtotal and clamps a waiver that
  // exceeds the charge — both rules the server applies, neither restated
  // here. A quote that is refused or unchecked grants nothing, which is
  // `quoteAdjustments`'s business and not this screen's.
  const totals = cartTotals(subtotalPaise, quoteAdjustments(quote));
  const offline = reachability === "offline";
  const band = service ? deliveryBand(service) : null;

  return (
    <Screen gutter={false} edges={edgesUnderHeader}>
      {/*
        KeyboardAvoidingView plus a scroll container, and no
        `react-native-keyboard-controller` — which is a dependency, and rule
        12 says to ask before taking one.

        `padding` on iOS, nothing on Android. Android resizes the window for
        the keyboard by itself (`softwareKeyboardLayoutMode: "resize"` is
        Expo's default), so a `height` behaviour there fights the OS and
        produces a jump on the first focus. iOS does not resize, hence the
        padding. This is the combination the New Architecture docs describe
        and it holds on both platforms for a form of plain single-line inputs
        inside a ScrollView; if a future field needs the keyboard to track a
        caret inside a growing text area, that is the measurement that would
        justify the dependency.
      */}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          // Tapping Place Order with the keyboard up presses the button
          // rather than only dismissing the keyboard and making the customer
          // tap twice.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Eyebrow>Checkout</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            Where should this go?
          </Text>

          {prefilled && (
            <Notice
              tone="info"
              message="Filled in from your saved details. Change anything that has moved — it will not affect the address on file."
            />
          )}

          {/* ---------- Contact ---------- */}
          <View style={styles.section}>
            <Eyebrow heading>Contact details</Eyebrow>

            <Field
              label="Full name"
              value={form.name}
              onChangeText={(value) => update("name", value)}
              error={errors.name}
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              maxLength={160}
              inputRef={(node) => {
                inputs.current.name = node;
              }}
            />

            <Field
              label="Email"
              value={form.email}
              onChangeText={(value) => update("email", value)}
              error={errors.email}
              hint="Your receipt and tracking updates go here."
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              autoCapitalize="none"
              maxLength={200}
              inputRef={(node) => {
                inputs.current.email = node;
              }}
            />

            <Field
              label="Mobile number"
              value={form.phone}
              onChangeText={(value) => update("phone", normalisePhone(value))}
              error={errors.phone}
              hint="10 digits, for delivery calls."
              keyboardType="phone-pad"
              autoComplete="tel-national"
              textContentType="telephoneNumber"
              autoCapitalize="none"
              inputRef={(node) => {
                inputs.current.phone = node;
              }}
            />
          </View>

          <SoilLine />

          {/* ---------- Address ---------- */}
          <View style={styles.section}>
            <Eyebrow heading>Delivery address</Eyebrow>

            <Field
              label="Address"
              value={form.line1}
              onChangeText={(value) => update("line1", value)}
              error={errors.line1}
              autoComplete="address-line1"
              textContentType="streetAddressLine1"
              maxLength={200}
              inputRef={(node) => {
                inputs.current.line1 = node;
              }}
            />

            <Field
              label="Apartment, floor"
              optional
              value={form.line2}
              onChangeText={(value) => update("line2", value)}
              error={errors.line2}
              autoComplete="address-line2"
              textContentType="streetAddressLine2"
              maxLength={200}
              inputRef={(node) => {
                inputs.current.line2 = node;
              }}
            />

            <Field
              label="City"
              value={form.city}
              onChangeText={(value) => update("city", value)}
              error={errors.city}
              autoComplete="postal-address-locality"
              textContentType="addressCity"
              autoCapitalize="words"
              maxLength={100}
              inputRef={(node) => {
                inputs.current.city = node;
              }}
            />

            <StateField
              value={form.state}
              onChange={setState}
              error={errors.state}
            />

            <Field
              label="PIN code"
              value={form.pincode}
              onChangeText={(value) => update("pincode", normalisePincode(value))}
              error={errors.pincode}
              keyboardType="number-pad"
              autoComplete="postal-code"
              textContentType="postalCode"
              autoCapitalize="none"
              inputRef={(node) => {
                inputs.current.pincode = node;
              }}
            />

            {service !== null && (
              <View
                accessibilityLiveRegion="polite"
                accessibilityRole="summary"
                style={styles.estimate}
              >
                {service.code === "OK" && service.zone !== null ? (
                  <>
                    <Text style={styles.estimateHead}>
                      {service.circle} · {service.zone.label}
                    </Text>
                    {band !== null && (
                      <Text style={styles.estimateBody}>{band}.</Text>
                    )}
                  </>
                ) : (
                  // UNASSIGNED and ARMY_POSTAL are honest answers about a real
                  // address, not failures, and the server's sentence already
                  // says what to do about each. Neither stops the order.
                  <Text style={styles.estimateBody}>{service.message}</Text>
                )}
              </View>
            )}

            <Field
              label="Landmark"
              optional
              value={form.landmark}
              onChangeText={(value) => update("landmark", value)}
              error={errors.landmark}
              maxLength={200}
              inputRef={(node) => {
                inputs.current.landmark = node;
              }}
            />

            <Field
              label="Anything the courier should know"
              optional
              value={form.notes}
              onChangeText={(value) => update("notes", value)}
              error={errors.notes}
              multiline
              maxLength={500}
              inputRef={(node) => {
                inputs.current.notes = node;
              }}
            />
          </View>

          <SoilLine />

          {/* ---------- Payment ---------- */}
          <View style={styles.section}>
            <Eyebrow heading>Payment</Eyebrow>
            <Text style={styles.payTitle}>Cash on Delivery</Text>
            <Text style={styles.body}>
              Pay the courier when your order arrives. Available across India.
            </Text>
            <Text style={styles.bodyQuiet}>
              This app takes Cash on Delivery. Paying online is not built into
              it yet.
            </Text>
          </View>

          <SoilLine />

          {/* ---------- Summary ---------- */}
          <OrderSummary
            items={items}
            totals={totals}
            couponCode={couponCode}
            quote={quote}
            busy={quoting}
            onDropCoupon={dropCoupon}
          />

          {/* ---------- Refusals ---------- */}
          {refusal !== null && (
            <RefusalPanel
              refusal={refusal}
              items={items}
              onReduce={reduceToAvailable}
              onDropCoupon={dropCoupon}
              onRemoveLine={removeLine}
            />
          )}

          {/* ---------- Place the order ---------- */}
          <Button
            size="lg"
            onPress={() => void submit()}
            disabled={placing || offline}
            accessibilityHint={
              offline
                ? OFFLINE_REASON
                : "Places the order. You pay the courier on delivery."
            }
            style={styles.place}
          >
            {placing
              ? "Placing your order…"
              : `Place order · ${formatPaise(totals.totalPaise)}`}
          </Button>

          {offline && (
            <View accessibilityLiveRegion="polite" style={styles.offline}>
              <Text style={styles.offlineText}>{OFFLINE_REASON}</Text>
              {/*
                No queue, deliberately. `src/lib/offline-queue.ts` exists for
                the web; the same thing here would mean a customer believing
                an order exists on a device that might not be opened for two
                days, and the shop learning about it whenever that happens.
              */}
              <View style={styles.actions}>
                <Button variant="secondary" onPress={retryConnection}>
                  Try again
                </Button>
              </View>
            </View>
          )}

          <Text style={styles.terms}>
            Placing this order accepts the terms and the refund policy.
          </Text>
          <View style={styles.actions}>
            <Button
              variant="ghost"
              onPress={() =>
                router.push({ pathname: "/content/[key]", params: { key: "terms" } })
              }
            >
              Terms
            </Button>
            <Button
              variant="ghost"
              onPress={() =>
                router.push({ pathname: "/content/[key]", params: { key: "refund" } })
              }
            >
              Refund policy
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* The refusal, and the control that fixes it                          */

/**
 * Which basket lines this phone's copy of the catalogue does not recognise.
 *
 * `UNKNOWN_VARIANT` does not say which line it means — the server sends one
 * sentence and no sku. Rather than guess, this reads the catalogue already
 * cached on the device and reports the lines whose variant no longer exists
 * in it. That copy can be an hour old, so it is evidence and not proof: when
 * it identifies nothing (no cache, or a variant that was withdrawn since the
 * document was published) the caller falls back to offering every line, which
 * is honest about not knowing.
 *
 * Read synchronously and only when a refusal has actually happened. Mounting
 * `useCatalog()` here would put a conditional GET on every checkout for a
 * branch almost nobody reaches.
 */
function unrecognisedLines(items: readonly CartItem[]): CartItem[] {
  const cached = readCachedDocument(CATALOG_DOCUMENT.cacheKey);
  if (!cached) return [];
  try {
    const document = JSON.parse(cached.body) as CatalogDocument;
    const known = new Set<number>();
    for (const product of document.products) {
      for (const variant of product.variants) known.add(variant.id);
    }
    return items.filter((item) => !known.has(item.variantId));
  } catch {
    return [];
  }
}

function RefusalPanel({
  refusal,
  items,
  onReduce,
  onDropCoupon,
  onRemoveLine,
}: {
  refusal: Refusal;
  items: readonly CartItem[];
  onReduce: (item: CartItem, available: number) => void;
  onDropCoupon: () => void;
  onRemoveLine: (item: CartItem) => void;
}) {
  if (refusal.kind === "info") {
    return <Notice tone="info" message={refusal.message} />;
  }

  if (refusal.kind === "stock") {
    const line = items.find((item) => item.sku === refusal.sku);
    return (
      <Notice
        title={line ? `${line.productName}, ${line.packLabel}` : refusal.sku}
        message={refusal.message}
      >
        {line && (
          <Button
            variant="secondary"
            onPress={() => onReduce(line, refusal.available)}
          >
            {refusal.available > 0
              ? `Reduce to ${refusal.available}`
              : `Remove ${line.packLabel}`}
          </Button>
        )}
      </Notice>
    );
  }

  if (refusal.kind === "coupon") {
    return (
      <Notice message={refusal.message}>
        <Button variant="secondary" onPress={onDropCoupon}>
          Place it without the code
        </Button>
      </Notice>
    );
  }

  if (refusal.kind === "unknownVariant") {
    const unknown = unrecognisedLines(items);
    const offered = unknown.length > 0 ? unknown : items;
    return (
      <Notice message={refusal.message}>
        {offered.map((item) => (
          <Button
            key={item.variantId}
            variant="secondary"
            onPress={() => onRemoveLine(item)}
            accessibilityLabel={`Remove ${item.productName}, ${item.packLabel} from the basket`}
          >
            {`Remove ${item.productName}, ${item.packLabel}`}
          </Button>
        ))}
      </Notice>
    );
  }

  return <Notice message={refusal.message} />;
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: space.x5,
    paddingTop: space.x6,
    // Deep, so the last field can sit above the keyboard when it is focused
    // and the Place Order button is never under the home indicator.
    paddingBottom: space.x16,
  },
  plain: {
    paddingTop: space.x6,
  },
  h1: {
    marginTop: space.x5,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  section: {
    marginTop: space.x8,
  },
  body: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  bodyQuiet: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  payTitle: {
    marginTop: space.x5,
    fontFamily: font.bodySemiBold,
    ...typeScale.t20,
    color: color.green900,
  },
  estimate: {
    marginTop: space.x4,
    borderLeftWidth: 2,
    borderLeftColor: color.gold500,
    paddingLeft: space.x4,
    paddingVertical: space.x1,
  },
  estimateHead: {
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    color: color.green900,
  },
  estimateBody: {
    marginTop: space.x1,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  place: {
    marginTop: space.x8,
  },
  offline: {
    marginTop: space.x4,
    borderLeftWidth: 2,
    borderLeftColor: color.terracotta,
    paddingLeft: space.x4,
    paddingVertical: space.x2,
  },
  offlineText: {
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
  },
  terms: {
    marginTop: space.x7,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  actions: {
    marginTop: space.x4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x3,
  },
});
