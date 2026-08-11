import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import { savedAddressSchema } from "@ekmool/contracts/account";
import { INDIAN_STATE_OPTIONS } from "@ekmool/contracts/checkout";

import {
  createAddress,
  listAddresses,
  type SavedAddress,
} from "@/api/account";
import { Button, Eyebrow, Screen, SoilLine, edgesUnderHeader } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * The address book.
 *
 * **The app sends ids and nothing else that identifies an owner.** There is
 * no `customerId` in any request on this screen; the server resolves the
 * customer from the bearer token and puts `customer_id` in the `WHERE` of
 * every address query, even where the address id alone is unique. That is
 * what makes "you can only touch your own" a property of the query rather
 * than of this client behaving itself — docs/SECURITY.md.
 *
 * The fields and their rules come from `savedAddressSchema` in
 * `@ekmool/contracts/account`, which is the same schema the server enforces
 * and the same one checkout uses, so an address saved here is by
 * construction one checkout would accept. **The client validates for the
 * message; the server validates for the decision.** Never widen this schema
 * to make a keyboard easier.
 *
 * **This screen lists and adds. It does not edit, delete or change the
 * default**, because the route does not: `POST /api/account/addresses` is
 * create-only and says so in its own header, on the grounds that a route
 * nobody calls is a surface nobody is testing. An Edit button here would
 * post a body whose `id` `savedAddressSchema` silently strips, and the
 * customer would get a duplicate address rather than an edit — which is why
 * the buttons are absent rather than hopeful. The copy at the foot says
 * where those three can be done instead, rather than the screen staying
 * quiet about something it cannot do.
 *
 * The one thing it can still change is which address checkout uses: a new
 * address saved with "Use this one at checkout" becomes the default, because
 * `createAddress` clears the flag on the others. That is the route's
 * behaviour, not a trick played here.
 */

/** The server's own ceiling, from `apps/web/src/db/queries/customers.ts`. */
const MAX_ADDRESSES = 10;

type FieldErrors = Record<string, string>;

interface FormValues {
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
  isDefault: boolean;
}

const EMPTY_FORM: FormValues = {
  label: "Home",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
  isDefault: false,
};

/* ------------------------------------------------------------------ */

export default function AddressesScreen() {
  const { session } = useSession();

  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signedIn = session.status === "signed-in";

  const load = useCallback(async (signal?: AbortSignal) => {
    const result = await listAddresses({ signal });
    if (signal?.aborted) return;
    if (result.ok) {
      setAddresses(result.data?.addresses ?? []);
      setLoadFailure(null);
      return;
    }
    if (result.code === "CANCELLED" || result.code === "NO_SESSION") return;
    setLoadFailure(result.message);
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setAddresses(null);
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, signedIn]);

  const submit = useCallback(
    async (values: FormValues): Promise<FieldErrors | null> => {
      // The client validates for the message, the server for the decision —
      // and it validates with this same schema, so the two cannot disagree
      // about what a valid PIN code is.
      const parsed = savedAddressSchema.safeParse(values);
      if (!parsed.success) {
        const errors: FieldErrors = {};
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[issue.path.length - 1] ?? "");
          if (field && !errors[field]) errors[field] = issue.message;
        }
        return errors;
      }

      setBusy(true);
      setSaveFailure(null);

      // The parsed value, not the raw form: the schema trims every string,
      // and sending the untrimmed one would save "  Home" as a label.
      const result = await createAddress(parsed.data);
      setBusy(false);

      if (!result.ok) {
        setSaveFailure(result.message);
        AccessibilityInfo.announceForAccessibility(result.message);
        return null;
      }

      // The whole book comes back with the 201, so this screen never appends
      // what it sent — which would show two defaults, or none, because the
      // server decides which row carries the flag.
      setAddresses(result.data?.addresses ?? []);
      setAdding(false);
      AccessibilityInfo.announceForAccessibility("Address saved.");
      return null;
    },
    [],
  );

  /* ---------------- gates ---------------- */

  if (session.status === "loading") {
    return (
      <Screen edges={edgesUnderHeader}>
        <View style={styles.content}>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            Checking this phone…
          </Text>
        </View>
      </Screen>
    );
  }

  if (session.status === "signed-out") {
    return (
      <Screen edges={edgesUnderHeader}>
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>Saved addresses</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            Find your order first.
          </Text>
          <Text style={styles.body}>
            Saved addresses belong to the email an order was placed with.
            Look up any order with its reference and that email, and the
            addresses saved against it are here.
          </Text>
          <View style={styles.actions}>
            <Button onPress={() => router.push("/sign-in")}>Find my order</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const atLimit = (addresses?.length ?? 0) >= MAX_ADDRESSES;

  return (
    <Screen edges={edgesUnderHeader}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Eyebrow>Your account</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            Saved addresses.
          </Text>
          <Text style={styles.body}>
            Your default fills in checkout, so ordering again is a matter of
            seconds. Saving one here never changes an order already placed.
          </Text>

          {(loadFailure ?? saveFailure) !== null && (
            <View accessibilityLiveRegion="assertive" role="alert" style={styles.refusal}>
              <Text style={styles.refusalText}>{saveFailure ?? loadFailure}</Text>
            </View>
          )}

          <SoilLine />

          {addresses === null && loadFailure === null && (
            <Text accessibilityLiveRegion="polite" style={styles.body}>
              Fetching your addresses…
            </Text>
          )}

          {addresses !== null && addresses.length === 0 && !adding && (
            <Text style={styles.body}>
              Nothing saved against this address yet.
            </Text>
          )}

          {addresses?.map((address) => (
            <View key={address.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardLabel}>{address.label}</Text>
                {address.isDefault && <Text style={styles.badge}>Default</Text>}
              </View>
              <Text style={styles.cardAddress}>
                {address.line1}
                {address.line2 ? `\n${address.line2}` : ""}
                {"\n"}
                {address.city}, {address.state} {address.pincode}
                {/* "Landmark: X", not "Near X" — people write "Opposite the
                    temple" or "Behind the school", and prefixing that reads
                    wrong. */}
                {address.landmark ? `\nLandmark: ${address.landmark}` : ""}
              </Text>
            </View>
          ))}

          {adding ? (
            <AddressForm
              initial={EMPTY_FORM}
              busy={busy}
              onCancel={() => setAdding(false)}
              onSubmit={submit}
            />
          ) : (
            <View style={styles.actions}>
              <Button
                variant="secondary"
                disabled={atLimit || addresses === null}
                onPress={() => setAdding(true)}
              >
                Add an address
              </Button>
            </View>
          )}

          {atLimit && (
            <Text style={styles.note}>
              You can keep up to {MAX_ADDRESSES} addresses. Delete one you no
              longer use to add another.
            </Text>
          )}

          <Text style={styles.note}>
            Changing or deleting a saved address, and picking which one
            checkout uses, are on ekmool.in under Your account — the app can
            only add. Saving a new address with “Use this one at checkout”
            makes it the default, which is the one part it can do. Nothing
            here changes an order already placed.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The form.
 *
 * Every input has a **visible** label above it. React Native makes the
 * floating-label pattern tempting because there is no `<label for>`; the
 * design system's answer is already no — a placeholder disappears exactly
 * when the user needs it. Errors sit next to their field, not only in a
 * summary at the top.
 *
 * The field component is local to this screen, as it is on the sign-in
 * screen, because `src/components/ui/`'s barrel is not this change's to
 * edit. Two copies is the point at which it should become `ui/Field.tsx`;
 * a third would be too many.
 */
function AddressForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: FormValues;
  busy: boolean;
  onSubmit: (values: FormValues) => Promise<FieldErrors | null>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [stateFilter, setStateFilter] = useState("");

  const set = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }, []);

  const stateOptions = useMemo(() => {
    const needle = stateFilter.trim().toLowerCase();
    if (needle.length === 0) return INDIAN_STATE_OPTIONS;
    return INDIAN_STATE_OPTIONS.filter((option) =>
      option.toLowerCase().includes(needle),
    );
  }, [stateFilter]);

  const submit = useCallback(async () => {
    const result = await onSubmit(values);
    if (result !== null) {
      setErrors(result);
      AccessibilityInfo.announceForAccessibility(
        Object.values(result).join(". "),
      );
    }
  }, [onSubmit, values]);

  return (
    <View style={styles.form}>
      <Field
        label="Name this address"
        hint="Home, Work, Parents — whatever you will recognise."
        value={values.label}
        onChangeText={(value) => set("label", value)}
        error={errors.label}
        maxLength={40}
        autoCapitalize="words"
        editable={!busy}
      />
      <Field
        label="Address"
        hint="Flat or house number, street."
        value={values.line1}
        onChangeText={(value) => set("line1", value)}
        error={errors.line1}
        maxLength={200}
        autoCapitalize="words"
        autoComplete="address-line1"
        editable={!busy}
      />
      <Field
        label="Apartment, floor (optional)"
        hint="Anything that helps the courier find the door."
        value={values.line2}
        onChangeText={(value) => set("line2", value)}
        error={errors.line2}
        maxLength={200}
        autoCapitalize="words"
        autoComplete="address-line2"
        editable={!busy}
      />
      <Field
        label="City"
        hint="The town or city on the parcel."
        value={values.city}
        onChangeText={(value) => set("city", value)}
        error={errors.city}
        maxLength={100}
        autoCapitalize="words"
        editable={!busy}
        autoComplete="postal-address-locality"
      />

      {/* ---------- State ---------- */}
      <View style={styles.field}>
        <Text style={styles.label}>State</Text>
        {values.state !== "" ? (
          <View style={styles.chosenRow}>
            <Text style={styles.chosen}>{values.state}</Text>
            <Button
              variant="ghost"
              onPress={() => {
                set("state", "");
                setStateFilter("");
              }}
              disabled={busy}
              accessibilityLabel="Change state"
            >
              Change
            </Button>
          </View>
        ) : (
          <>
            {/* A filter above a radio list, rather than a native picker.
                There is no picker in React Native core and adding one is a
                dependency (rule 12); a 36-row list is also the option that
                works with a screen reader and at 200% text scale, which a
                wheel picker does not. */}
            <TextInput
              value={stateFilter}
              onChangeText={setStateFilter}
              editable={!busy}
              accessibilityLabel="Search states"
              accessibilityHint="Narrows the list below"
              autoCapitalize="words"
              autoCorrect={false}
              style={styles.input}
            />
            <View accessibilityRole="radiogroup" style={styles.stateList}>
              {stateOptions.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => set("state", option)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: values.state === option }}
                  accessibilityLabel={option}
                  android_ripple={{ color: color.green200 }}
                  style={styles.stateOption}
                >
                  <Text style={styles.stateOptionText}>{option}</Text>
                </Pressable>
              ))}
              {stateOptions.length === 0 && (
                <Text style={styles.stateEmpty}>
                  No state matches that. We deliver across India — check the
                  spelling.
                </Text>
              )}
            </View>
          </>
        )}
        {errors.state !== undefined && (
          <Text style={styles.fieldError}>{errors.state}</Text>
        )}
      </View>

      <Field
        label="PIN code"
        hint="Six digits."
        value={values.pincode}
        onChangeText={(value) => set("pincode", value.replace(/\D/g, ""))}
        error={errors.pincode}
        maxLength={6}
        keyboardType="number-pad"
        autoComplete="postal-code"
        editable={!busy}
      />
      <Field
        label="Landmark (optional)"
        hint="Opposite the temple, behind the school — whatever people say."
        value={values.landmark}
        onChangeText={(value) => set("landmark", value)}
        error={errors.landmark}
        maxLength={200}
        autoCapitalize="sentences"
        editable={!busy}
      />

      <Pressable
        onPress={() => set("isDefault", !values.isDefault)}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: values.isDefault, disabled: busy }}
        accessibilityLabel="Use this one at checkout"
        style={styles.checkboxRow}
      >
        <View style={[styles.checkbox, values.isDefault && styles.checkboxOn]}>
          {/* A tick drawn as text, so it scales with the type and needs no
              icon font. Hidden from the reader — accessibilityState above
              already says whether it is checked. */}
          {values.isDefault && (
            <Text accessibilityElementsHidden style={styles.checkboxTick}>
              ✓
            </Text>
          )}
        </View>
        <Text style={styles.checkboxLabel}>Use this one at checkout</Text>
      </Pressable>

      <View style={styles.actionsTight}>
        <Button onPress={() => void submit()} disabled={busy}>
          {busy ? "Saving…" : "Save address"}
        </Button>
        <Button variant="ghost" onPress={onCancel} disabled={busy}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

function Field(props: {
  label: string;
  hint: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  maxLength?: number;
  keyboardType?: "default" | "number-pad";
  autoCapitalize?: "none" | "words" | "sentences";
  autoComplete?:
    | "address-line1"
    | "address-line2"
    | "postal-address-locality"
    | "postal-code";
  editable?: boolean;
}) {
  const { error, hint, label } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        editable={props.editable ?? true}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        aria-invalid={error !== undefined}
        autoCapitalize={props.autoCapitalize ?? "none"}
        autoComplete={props.autoComplete}
        autoCorrect={false}
        keyboardType={props.keyboardType}
        maxLength={props.maxLength}
        placeholderTextColor={color.green700}
        style={[styles.input, error !== undefined && styles.inputInvalid]}
      />
      <Text style={error !== undefined ? styles.fieldError : styles.fieldHint}>
        {error ?? hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
  body: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  note: {
    marginTop: space.x6,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  card: {
    marginTop: space.x6,
    borderTopWidth: 1,
    borderTopColor: color.green200,
    paddingTop: space.x5,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.x3,
  },
  cardLabel: {
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  badge: {
    backgroundColor: color.gold100,
    // gold-800 is the only gold that clears 4.5:1 as ink on a light ground.
    color: color.gold800,
    paddingHorizontal: space.x2,
    paddingVertical: space.x1,
    borderRadius: radius.sm,
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
  },
  cardAddress: {
    marginTop: space.x2,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  form: {
    marginTop: space.x6,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.cream,
    paddingHorizontal: space.x4,
    paddingVertical: space.x5,
  },
  field: { marginBottom: space.x5 },
  label: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  input: {
    marginTop: space.x2,
    minHeight: space.x11, // the 44pt floor, on inputs as much as on buttons
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.paper,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
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
  chosenRow: {
    marginTop: space.x2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  chosen: {
    flex: 1,
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  stateList: {
    marginTop: space.x2,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.paper,
    overflow: "hidden",
  },
  stateOption: {
    minHeight: space.x11,
    justifyContent: "center",
    paddingHorizontal: space.x3,
    borderBottomWidth: 1,
    borderBottomColor: color.green200,
  },
  stateOptionText: {
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
  },
  stateEmpty: {
    padding: space.x3,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  checkboxRow: {
    minHeight: space.x11,
    flexDirection: "row",
    alignItems: "center",
    gap: space.x3,
  },
  checkbox: {
    width: space.x6,
    height: space.x6,
    borderWidth: 1,
    borderColor: color.green900,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.paper,
  },
  checkboxOn: { backgroundColor: color.gold500, borderColor: color.gold500 },
  checkboxTick: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t15,
    // green-950 on gold-500: the gold is the ground here, not the ink.
    color: color.green950,
  },
  checkboxLabel: {
    flex: 1,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
  },
  refusal: {
    marginTop: space.x6,
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
  actions: {
    marginTop: space.x7,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x4,
  },
  actionsTight: {
    marginTop: space.x3,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x3,
  },
});
