import { useCallback, useState } from "react";
import {
  AccessibilityInfo,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import { eraseAccount, exportAccountData } from "@/api/account";
import { signOut } from "@/api/session";
import { Button, Eyebrow, Screen, SoilLine, edgesUnderHeader } from "@/components/ui";
import { useSession } from "@/hooks/useSession";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * Your data — DPDP Act 2023, ss. 11 and 12, on a phone.
 *
 * The two rights are here and both work immediately: there is no form to
 * submit and nobody to wait for. That is the same promise `/account/privacy`
 * makes on the web, and it is made here in the same words.
 *
 * **The erasure copy says plainly that orders are anonymised rather than
 * deleted.** They are financial records with a statutory retention period, so
 * the transaction stays and every trace of the person comes off it. Telling
 * someone their data is gone when the row is still there would be the actual
 * violation, and a shorter, friendlier sentence here would be exactly that
 * lie in a nicer font.
 *
 * Erasure needs the word ERASE typed out. Not a confirm dialog: a typed word
 * survives a mis-tap, a double-tap and a replayed request, and this is the
 * one action in the app that cannot be undone. It is also the only place a
 * destructive control is styled as the loud one — anywhere else that would
 * be a dark pattern, but a hesitant-looking button on an irreversible action
 * hides the consequence rather than the control.
 */

export default function PrivacyScreen() {
  const { session } = useSession();

  const [busy, setBusy] = useState<null | "export" | "erase">(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const exportData = useCallback(async () => {
    if (busy !== null) return;
    setBusy("export");
    setFailure(null);

    const result = await exportAccountData();
    setBusy(null);

    if (!result.ok) {
      setFailure(result.message);
      AccessibilityInfo.announceForAccessibility(result.message);
      return;
    }

    /*
     * The share sheet is this platform's "download".
     *
     * On the web the route sends `Content-Disposition: attachment` and the
     * browser's own download handling takes over. A phone has no downloads
     * folder to hand a fetch's response to, and writing one would need
     * `expo-file-system` plus `expo-sharing` — two dependencies, and rule 12
     * says to ask first. `Share` is in React Native itself, and what it does
     * is the thing the right actually requires: it hands the person their own
     * data in a form they can keep, re-read and take elsewhere — to Files, to
     * Drive, to their own email.
     *
     * Sent as `message` rather than a `url`, because there is no file on disk
     * to point at. The honest limit: a very long history makes a very long
     * message, and some share targets truncate. If that turns out to bite,
     * `expo-file-system` is the request to make, with the size that caused
     * it.
     */
    const json = JSON.stringify(result.data, null, 2);
    try {
      await Share.share({
        title: "Your Ekmool data",
        message: json,
      });
    } catch {
      // A dismissed sheet does not throw; this is the sheet failing to open
      // at all, which is rare and is not the customer's fault to explain.
      setFailure(
        "This phone would not open the share sheet. You can download the same file from Your account on ekmool.in.",
      );
    }
  }, [busy]);

  const erase = useCallback(async () => {
    if (busy !== null) return;
    setBusy("erase");
    setFailure(null);

    // What the customer typed, upper-cased and trimmed — the same
    // normalisation the web does before sending. The server compares against
    // the exact word and refuses anything else; this client does not supply
    // the confirmation on their behalf, because a confirmation the client can
    // write is not a confirmation.
    const result = await eraseAccount(confirmation.trim().toUpperCase());
    setBusy(null);

    if (!result.ok) {
      setFailure(result.message);
      AccessibilityInfo.announceForAccessibility(result.message);
      return;
    }

    // The bearer token cannot be withdrawn server-side — it is stateless, so
    // there is no cookie to overwrite and no session row to revoke. It stays
    // verifiable until it expires and now names an address with no customer
    // behind it. **The client's part of erasure is deleting the keystore
    // entry**, and the erase route's own comment says so.
    await signOut();
    setDone(result.data.message);
    AccessibilityInfo.announceForAccessibility(result.data.message);
  }, [busy, confirmation]);

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

  if (done !== null) {
    return (
      <Screen edges={edgesUnderHeader}>
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>Your data</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            Done.
          </Text>
          <Text style={styles.body}>{done}</Text>
          <View style={styles.actions}>
            <Button onPress={() => router.replace("/")}>Back to the shop</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (session.status === "signed-out") {
    return (
      <Screen edges={edgesUnderHeader}>
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>Your data</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            Find your order first.
          </Text>
          <Text style={styles.body}>
            We hold data against the email an order was placed with, so we
            have to know which address you mean before we can show it to you
            or erase it. Look up any order with its reference and that email.
          </Text>
          <View style={styles.actions}>
            <Button onPress={() => router.push("/sign-in")}>Find my order</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const email = session.email;
  const canErase = confirmation.trim().toUpperCase() === "ERASE";

  return (
    <Screen edges={edgesUnderHeader}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Eyebrow>Your account</Eyebrow>
        <Text accessibilityRole="header" style={styles.h1}>
          Your data.
        </Text>
        <Text style={styles.body}>
          The Digital Personal Data Protection Act 2023 gives you the right to
          see what we hold about you and to have it erased. Both are below,
          and both work immediately — there is no form to submit and no one to
          wait for.
        </Text>

        {failure !== null && (
          <View accessibilityLiveRegion="assertive" role="alert" style={styles.refusal}>
            <Text style={styles.refusalText}>{failure}</Text>
          </View>
        )}

        <SoilLine />

        <Text accessibilityRole="header" style={styles.h2}>
          What we hold about {email}
        </Text>
        <Text style={styles.item}>
          · Your name, email, phone number and whether you asked for our
          occasional emails.
        </Text>
        <Text style={styles.item}>
          · Any addresses you saved, which are only ever used to fill in a
          checkout.
        </Text>
        <Text style={styles.item}>
          · Your orders — what was bought, what was paid, where it was sent
          and what happened to it.
        </Text>
        <Text style={styles.item}>
          · A record of the emails we sent you about those orders.
        </Text>
        <Text style={styles.body}>
          We hold nothing else. There is no advertising profile, no data sold
          or shared, and analytics only runs if you said yes. The privacy
          policy on ekmool.in sets out the detail.
        </Text>

        <SoilLine />

        {/* ---------- Export ---------- */}
        <Text accessibilityRole="header" style={styles.h2}>
          Take everything with you
        </Text>
        <Text style={styles.body}>
          Every row we hold against {email}, exactly as it is stored. Nothing
          is summarised or left out. This phone hands it to whatever you use
          to keep files — Files, Drive, or your own email.
        </Text>
        <View style={styles.actions}>
          <Button
            variant="secondary"
            onPress={() => void exportData()}
            disabled={busy !== null}
            accessibilityHint="Fetches your data and opens the share sheet"
          >
            {busy === "export" ? "Preparing…" : "Export my data"}
          </Button>
        </View>

        <SoilLine />

        {/* ---------- Erase ---------- */}
        <Text accessibilityRole="header" style={styles.h2}>
          Erase my data
        </Text>
        <Text style={styles.body}>
          This cannot be undone, so read what it does first.
        </Text>

        <Text style={styles.term}>Deleted outright</Text>
        <Text style={styles.definition}>
          Your account, your name, your phone number, your saved addresses,
          your saved items, any reviews you wrote, your newsletter
          subscription, any back-in-stock requests, and your email address
          wherever it appears.
        </Text>

        <Text style={styles.term}>Kept, but no longer yours</Text>
        <Text style={styles.definition}>
          The orders themselves. Indian tax law requires the transaction
          records behind an invoice to be kept for several years, so they stay
          — with every trace of you overwritten. What remains says what was
          sold, for how much, and to which state. It identifies nobody.
        </Text>

        <Text style={styles.term}>You will be signed out</Text>
        <Text style={styles.definition}>
          This phone forgets its sign-in straight away, and a browser still
          signed in stops working too, because the address it names no longer
          belongs to anybody. You will not be able to look those orders up
          again either — the email that would have found them is gone.
        </Text>

        {!confirmOpen ? (
          <View style={styles.actions}>
            <Button
              variant="secondary"
              onPress={() => setConfirmOpen(true)}
              disabled={busy !== null}
            >
              I want to erase my data
            </Button>
          </View>
        ) : (
          <View style={styles.confirm}>
            <Text style={styles.label}>Type ERASE to confirm</Text>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              editable={busy === null}
              accessibilityLabel="Type ERASE to confirm"
              accessibilityHint="The button below stays disabled until this reads ERASE"
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              maxLength={10}
              style={styles.input}
            />
            <View style={styles.actionsTight}>
              <Button
                onPress={() => void erase()}
                disabled={busy !== null || !canErase}
              >
                {busy === "erase" ? "Erasing…" : "Erase my data permanently"}
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setConfirmOpen(false);
                  setConfirmation("");
                  setFailure(null);
                }}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            </View>
          </View>
        )}
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
  h2: {
    marginTop: space.x2,
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
  item: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  term: {
    marginTop: space.x5,
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    color: color.green900,
  },
  definition: {
    marginTop: space.x1_5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  confirm: {
    marginTop: space.x7,
    borderWidth: 1,
    borderColor: color.terracotta,
    borderRadius: radius.sm,
    paddingHorizontal: space.x4,
    paddingVertical: space.x4,
  },
  label: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green900,
  },
  input: {
    marginTop: space.x2,
    minHeight: space.x11,
    maxWidth: 220,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.paper,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    fontFamily: font.body,
    ...typeScale.t17,
    letterSpacing: typeScale.t17.fontSize * 0.12,
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
    marginTop: space.x6,
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
});
