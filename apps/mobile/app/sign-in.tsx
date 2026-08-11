import { useCallback, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { signIn } from "@/api/session";
import { Button, Eyebrow, Screen, SoilLine, edgesUnderHeader } from "@/components/ui";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * The door — and it is a door, not a registration form.
 *
 * `POST /api/v1/session` takes the eight-character reference printed on the
 * confirmation plus the address the order was placed with, and hands back a
 * signed token that goes straight into the keystore. That is the same proof
 * the web's `/track` asks a browser for, and the wording below is the web's
 * wording, from `apps/web/src/content/defaults.ts`, because two clients
 * describing the same door differently is how a customer concludes they are
 * two different things.
 *
 * **There is no account and there must never be one** (rule 7). So: no
 * password field, no "create an account", no "sign up instead", no social
 * buttons, and no "continue as guest" — that last one is the subtle version
 * of the same mistake, because it tells a customer an account exists that
 * they are declining.
 *
 * **One failure message, for a wrong reference and for a wrong email alike.**
 * The server sends exactly one sentence for both and this screen renders it
 * verbatim rather than composing its own. A message that distinguished them
 * would be an oracle: it would confirm which eight-character references are
 * real, and there are only 32^8 of them. `test:mobile-api` asserts the two
 * failures are byte-identical from this route; this screen's job is not to
 * undo that by being helpful.
 */

/** Long enough for a 26-character ULID pasted out of a link. */
const REFERENCE_MAX_LENGTH = 26;
const EMAIL_MAX_LENGTH = 200;

type FieldErrors = { reference?: string; email?: string };

/**
 * A labelled text input.
 *
 * Local to this screen rather than a primitive in `src/components/ui/`
 * because that layer's barrel is not this change's to edit. It is duplicated
 * once, in the address form, and the duplication is flagged there too — if a
 * third screen needs a text field, this becomes `ui/Field.tsx` and the two
 * copies go.
 *
 * The label is a real, visible `<Text>` above the field. A placeholder is not
 * a label; it disappears exactly when the user needs it, and React Native's
 * lack of a `<label for>` makes the floating-label pattern tempting for
 * precisely the wrong reason. `accessibilityLabel` on the input carries the
 * same string, because there is no element association to rely on here.
 */
function Field(props: {
  label: string;
  hint: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  inputRef?: RefObject<TextInput | null>;
  autoCapitalize?: "none" | "characters";
  autoComplete?: "email" | "off";
  keyboardType?: "default" | "email-address";
  textContentType?: "emailAddress" | "none";
  maxLength?: number;
  monospaced?: boolean;
  returnKeyType?: "next" | "done";
  onSubmitEditing?: () => void;
  editable?: boolean;
}) {
  const { error, hint, label } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={props.inputRef}
        value={props.value}
        onChangeText={props.onChangeText}
        editable={props.editable ?? true}
        accessibilityLabel={label}
        // The hint or the error, never both — a screen reader reading two
        // trailing sentences after every keystroke is worse than reading one.
        accessibilityHint={error ?? hint}
        aria-invalid={error !== undefined}
        autoCapitalize={props.autoCapitalize ?? "none"}
        autoComplete={props.autoComplete}
        autoCorrect={false}
        spellCheck={false}
        keyboardType={props.keyboardType}
        textContentType={props.textContentType}
        maxLength={props.maxLength}
        returnKeyType={props.returnKeyType}
        onSubmitEditing={props.onSubmitEditing}
        // submitBehavior, not the removed blurOnSubmit. "submit" keeps the
        // keyboard up so onSubmitEditing can move focus to the next field;
        // blurring first would drop the keyboard and then raise it again.
        submitBehavior={props.returnKeyType === "next" ? "submit" : "blurAndSubmit"}
        placeholderTextColor={color.green700}
        style={[
          styles.input,
          props.monospaced && styles.inputTracked,
          error !== undefined && styles.inputInvalid,
        ]}
      />
      <Text style={error !== undefined ? styles.fieldError : styles.fieldHint}>
        {error ?? hint}
      </Text>
    </View>
  );
}

export default function SignInScreen() {
  const params = useLocalSearchParams<{ ref?: string | string[] }>();
  // A repeated parameter arrives as an array. Take the first rather than
  // joining, which would prefill a reference nobody has.
  const initialReference = Array.isArray(params.ref) ? params.ref[0] : params.ref;

  const [reference, setReference] = useState(initialReference ?? "");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<TextInput | null>(null);

  const ready = useMemo(
    () => reference.trim().length > 0 && email.trim().length > 0,
    [email, reference],
  );

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setRefusal(null);

    // `signIn` validates with the server's own schema first — which also
    // normalises, stripping spaces, `#` and dashes and upper-casing — so what
    // goes on the wire is the parsed value and never the raw input.
    const result = await signIn(reference, email);

    if (result.ok) {
      // The token is in the keystore before this line runs; `signIn` stores it
      // before returning precisely so no screen can navigate to an account
      // view that then makes an unauthenticated request.
      //
      // back() rather than a push: this screen is always reached from
      // somewhere that wanted a session (the Orders tab, or a 401 four screens
      // deep), and that somewhere subscribes to the session and reloads.
      if (router.canGoBack()) router.back();
      else router.replace("/orders");
      return;
    }

    setSubmitting(false);

    if (result.code === "VALIDATION_FAILED") {
      // Field-level, and only for a shape this client could see was wrong —
      // a reference with an O in it (Crockford base32 has no I, L, O or U),
      // an address with no @. Never for a lookup that simply did not match.
      const issues = readIssues(result.payload);
      const next: FieldErrors = {};
      for (const issue of issues) {
        const field = issue.path.split(".").pop();
        if (field === "reference" && !next.reference) next.reference = issue.message;
        if (field === "email" && !next.email) next.email = issue.message;
      }
      if (Object.keys(next).length === 0) {
        setRefusal(result.message);
      } else {
        setErrors(next);
        AccessibilityInfo.announceForAccessibility(
          Object.values(next).join(". "),
        );
      }
      return;
    }

    // Everything else — LOOKUP_FAILED, RATE_LIMITED, DB_UNAVAILABLE, OFFLINE —
    // renders the message it came with. The server's refusal already names
    // the rule and knows things this client does not; composing a friendlier
    // one here is how the single-message property gets broken by accident.
    setRefusal(result.message);
    AccessibilityInfo.announceForAccessibility(result.message);
  }, [email, reference, submitting]);

  return (
    <Screen edges={edgesUnderHeader} gutter={false}>
      <KeyboardAvoidingView
        style={styles.fill}
        // iOS pushes the whole view; Android's soft input already resizes the
        // window, and adding padding on top of that scrolls the form off the
        // screen. `react-native-keyboard-controller` is not taken — this is
        // the "try KeyboardAvoidingView plus a scroll container first" the
        // plan asks for, and it holds on a two-field form.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Eyebrow>Your orders</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            Find your order.
          </Text>
          <Text style={styles.body}>
            There is no account to sign into and no password to remember. Give
            us the reference from your confirmation and the email you ordered
            with, and everything you have bought from us is there.
          </Text>

          <SoilLine />

          {refusal !== null && (
            <View accessibilityLiveRegion="assertive" role="alert" style={styles.refusal}>
              <Text style={styles.refusalText}>{refusal}</Text>
            </View>
          )}

          <Field
            label="Order reference"
            hint="The 8 characters after the # on your confirmation."
            value={reference}
            onChangeText={(value) => {
              setReference(value.toUpperCase());
              setErrors((previous) => ({ ...previous, reference: undefined }));
            }}
            error={errors.reference}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={REFERENCE_MAX_LENGTH}
            monospaced
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            editable={!submitting}
          />

          <Field
            label="Email address"
            hint="The address you used when you ordered."
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setErrors((previous) => ({ ...previous, email: undefined }));
            }}
            error={errors.email}
            inputRef={emailRef}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            maxLength={EMAIL_MAX_LENGTH}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            editable={!submitting}
          />

          <Button
            size="lg"
            onPress={() => void submit()}
            disabled={submitting || !ready}
            accessibilityHint="Checks the reference and email against your order"
            style={styles.submit}
          >
            {submitting ? "Checking…" : "Find my order"}
          </Button>

          <Text style={styles.note}>
            Lost the confirmation email? Check your spam folder first. If it is
            not there, get in touch from the Contact page on ekmool.in with the
            name and mobile number you ordered with and we will find it for
            you.
          </Text>

          <View style={styles.aside}>
            <Text style={styles.asideText}>
              This signs this phone in for thirty days. It is not an account:
              there is nothing to register for, nothing to delete, and signing
              out is this phone forgetting the token.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * The `issues` array off a 422 body, narrowed.
 *
 * `ApiFailure.payload` is `unknown` because its shape depends on the code —
 * that is stated in `src/api/client.ts` and it is right. Narrowing it is the
 * caller's job, at the call site that knows which code it asked about, and
 * this is that call site.
 */
function readIssues(payload: unknown): { path: string; message: string }[] {
  if (typeof payload !== "object" || payload === null) return [];
  const issues = (payload as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  const out: { path: string; message: string }[] = [];
  for (const entry of issues) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as { path?: unknown; message?: unknown };
    if (typeof record.path === "string" && typeof record.message === "string") {
      out.push({ path: record.path, message: record.message });
    }
  }
  return out;
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
  refusal: {
    marginBottom: space.x6,
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
  field: { marginBottom: space.x6 },
  label: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  input: {
    marginTop: space.x2,
    // 44pt is the floor from rule 11 and it applies to inputs as much as to
    // buttons. It is also why the form looks a little larger than a designer
    // would draw it.
    minHeight: space.x11,
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
  // The web sets `font-mono tracking-[0.12em] uppercase` on the reference so
  // the eight characters are countable. There is no monospace face in this
  // app's four embedded fonts and adding a fifth for one field is not worth
  // 40 KB, so the tracking does the work on its own.
  inputTracked: {
    letterSpacing: typeScale.t17.fontSize * 0.12,
  },
  inputInvalid: {
    borderColor: color.terracotta,
  },
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
  submit: { marginTop: space.x2 },
  note: {
    marginTop: space.x8,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  aside: {
    marginTop: space.x10,
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
