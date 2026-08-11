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
import { router, useLocalSearchParams } from "expo-router";

import {
  checkReviewEligibility,
  healthClaimNotice,
  issuesFromFailure,
  submitReview,
  type ReviewBlockedReason,
  type ReviewIssue,
} from "@/api/reviews";
import { Button, edgesUnderHeader, Eyebrow, Screen, SoilLine } from "@/components/ui";
import { useCatalog } from "@/hooks/useCachedDocument";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * Writing a review — **its own route, deliberately.**
 *
 * On the web the composer sits behind a "Write a review" button and is
 * pulled in with `next/dynamic`, because almost nobody on a product page
 * clicks it and the chunk is never requested while the button is unpressed
 * (`apps/web/src/components/product/ReviewForm.tsx`). The phone's equivalent
 * is not a modal inside `app/product/[slug].tsx`; it is this file.
 *
 * The mechanism is the reason. Metro produces one bundle, so nothing here
 * is *downloaded* lazily — but expo-router splits by route and only mounts
 * the screen that is navigated to, so a screen nobody visits is a screen
 * nobody parses, nobody lays out and nobody keeps mounted behind a product
 * page. A modal inside the product screen would put this form's state, its
 * effect and its eligibility request into every product view in the app,
 * which is exactly the cost `next/dynamic` is avoiding on the other client.
 *
 * The second reason is navigational and is the one a customer feels: the
 * back gesture. A modal owns `beforeRemove` and a swipe-back has to be
 * intercepted so a half-typed paragraph is not silently dropped. A route
 * gets the platform's own back behaviour, and the draft lives and dies with
 * the screen the customer is looking at.
 *
 * **Registration needed in `app/_layout.tsx`** (not edited here, as
 * instructed):
 *
 *     <Stack.Screen name="review/[slug]" options={{ title: "Write a review" }} />
 *
 * Until that line exists the route still resolves — expo-router infers a
 * screen from the file — but it draws the default header with the raw route
 * name in it.
 *
 * There is also no way to *reach* this screen yet: the entry point belongs
 * on `app/product/[slug].tsx`, which is out of scope for this change. It
 * wants a `Button` pushing
 * `{ pathname: "/review/[slug]", params: { slug: product.slug } }`, under
 * the same sentence the web prints — only a delivered order containing this
 * product can leave a review, and every one is read before it goes up.
 */

/* ------------------------------------------------------------------ */

/**
 * Why the form is not shown, in the shop's own voice.
 *
 * Eligibility is asked of the server the moment the screen opens, and the
 * fields appear only for somebody who can actually submit. Showing them to
 * everyone and refusing on send would waste the effort of anyone who typed a
 * paragraph without a delivered order behind it — the web makes the same
 * call and says so.
 *
 * `NO_SESSION` is the one that will be seen most, and the copy has to be
 * true of a phone rather than borrowed from the browser. It does not offer
 * an account, because there is not one to offer (rule 7). It names what is
 * missing — which order is yours — and where that can be settled today.
 */
const BLOCKED_COPY: Record<ReviewBlockedReason, string> = {
  NO_SESSION:
    "Reviews come from delivered orders, so we need to know which order is yours. This app cannot look one up yet — that arrives with checkout in the next release. Until then a review can be written on the website, from the tracking link in the order's confirmation email.",
  NOT_DELIVERED:
    "We can only publish a review once an order containing this product has been delivered to you.",
  ALREADY_REVIEWED:
    "You have already reviewed this product from that order. Thank you — it may still be waiting to be read.",
};

type Eligibility =
  | { state: "checking" }
  | { state: "eligible" }
  | { state: "blocked"; reason: ReviewBlockedReason }
  /** The check itself failed — offline, a timeout, the database. */
  | { state: "unavailable"; message: string };

type SendState = "idle" | "sending" | "done" | "error";

const RATINGS = [1, 2, 3, 4, 5] as const;

function issueFor(issues: readonly ReviewIssue[], path: ReviewIssue["path"]) {
  return issues.find((issue) => issue.path === path)?.message ?? null;
}

/* ------------------------------------------------------------------ */

export default function ReviewComposerScreen() {
  const params = useLocalSearchParams<{ slug: string | string[] }>();
  // A repeated parameter arrives as an array. Take the first rather than
  // joining, which would compose a slug nobody asked for.
  const slug = Array.isArray(params.slug) ? (params.slug[0] ?? "") : (params.slug ?? "");

  // The catalogue is already cached, so this costs no request and no frame.
  // It is here only for the product's name: "Your rating of Lakadong
  // turmeric" is a better legend than "Your rating of lakadong-turmeric".
  const { data: catalog } = useCatalog();
  const product = catalog?.products.find((entry) => entry.slug === slug) ?? null;
  const productName = product?.name ?? null;

  const [eligibility, setEligibility] = useState<Eligibility>({ state: "checking" });
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [send, setSend] = useState<SendState>("idle");
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<readonly ReviewIssue[]>([]);

  /**
   * One mapping from the server's answer to a screen state, shared by the
   * mount effect and the Try again button. Two copies of this is how the
   * retry path ends up drawing a state the first attempt does not.
   */
  const askEligibility = useCallback(
    async (signal?: AbortSignal) => {
      const result = await checkReviewEligibility(slug, { signal });
      if (signal?.aborted) return;

      if (!result.ok) {
        // CANCELLED is this screen unmounting; there is nobody left to tell.
        if (result.code === "CANCELLED") return;
        // A transport failure is NOT a blocked state. Rendering "we can only
        // publish a review once an order has been delivered" to somebody on a
        // train would be attributing our problem to their order.
        setEligibility({ state: "unavailable", message: result.message });
        return;
      }

      setEligibility(
        result.data.eligible
          ? { state: "eligible" }
          : { state: "blocked", reason: result.data.reason },
      );
    },
    [slug],
  );

  useEffect(() => {
    const controller = new AbortController();
    void askEligibility(controller.signal);
    return () => {
      controller.abort();
    };
  }, [askEligibility]);

  const retryEligibility = useCallback(() => {
    setEligibility({ state: "checking" });
    void askEligibility();
  }, [askEligibility]);

  /**
   * FSSAI. Recomputed as the draft changes, which is one regex over at most
   * ~2,100 characters — cheaper than the keystroke that triggered it.
   *
   * This is a notice and never a block: the submit button below does not
   * read it. See `healthClaimNotice` for why a word list may advise and may
   * not refuse.
   */
  const fssaiNotice = useMemo(
    () => healthClaimNotice(`${title}\n${body}`),
    [title, body],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  const onSubmit = useCallback(() => {
    if (send === "sending") return;

    void (async () => {
      setSend("sending");
      const result = await submitReview({ productSlug: slug, rating, title, body });

      if (!result.ok) {
        setSend("error");
        setIssues(
          result.code === "VALIDATION_FAILED" ? issuesFromFailure(result.payload) : [],
        );
        // The server's own sentence wherever there is one. It names the rule
        // that refused — "We can only publish reviews from a delivered order
        // containing this product" — and this client cannot say it better.
        setMessage(result.message);
        return;
      }

      setSend("done");
      setIssues([]);
      const confirmation =
        result.data.message.length > 0
          ? result.data.message
          : "Thank you — we read every review before it goes up, so it will appear shortly.";
      setMessage(confirmation);
      // The customer has just acted and the whole form has been replaced.
      // accessibilityLiveRegion covers Android; iOS has no live region for a
      // node that was not already mounted, so the announcement is explicit.
      AccessibilityInfo.announceForAccessibility(confirmation);
    })();
  }, [body, rating, send, slug, title]);

  /* ---------------- states that are not the form ---------------- */

  if (send === "done") {
    return (
      <Screen edges={edgesUnderHeader}>
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>Sent</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            It is with us.
          </Text>
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeText}>{message}</Text>
          </View>
          <Text style={styles.body}>
            Nothing goes up unread. If it is published you will see it on the
            product, under your first name and the initial of your surname.
          </Text>
          <View style={styles.actions}>
            <Button onPress={goBack}>Back</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (catalog !== null && product === null) {
    return (
      <Screen edges={edgesUnderHeader}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.h1}>
            This product is not on the shelf.
          </Text>
          <Text style={styles.body}>
            It may have been retired, or the link may have a typo. There is
            nothing here to review.
          </Text>
          <View style={styles.actions}>
            <Button variant="secondary" onPress={goBack}>
              Back to the shelf
            </Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (eligibility.state !== "eligible") {
    return (
      <Screen edges={edgesUnderHeader}>
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>Write a review</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            {productName ?? "This product"}
          </Text>

          <SoilLine />

          <View accessibilityLiveRegion="polite">
            {eligibility.state === "checking" && (
              <Text style={styles.body}>Checking your orders…</Text>
            )}
            {eligibility.state === "unavailable" && (
              <Text style={styles.body}>{eligibility.message}</Text>
            )}
            {eligibility.state === "blocked" && (
              <Text style={styles.body}>{BLOCKED_COPY[eligibility.reason]}</Text>
            )}
          </View>

          <Text style={styles.footNote}>
            Every review here comes from a delivered order and is read before
            it goes up. We have never written one and we have never bought one.
          </Text>

          <View style={styles.actions}>
            {eligibility.state === "unavailable" && (
              <Button onPress={retryEligibility}>Try again</Button>
            )}
            <Button variant="secondary" onPress={goBack}>
              Back
            </Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  /* ---------------- the form ---------------- */

  const titleError = issueFor(issues, "title");
  const bodyError = issueFor(issues, "body");
  const ratingError = issueFor(issues, "rating");

  return (
    <Screen edges={edgesUnderHeader}>
      {/*
        KeyboardAvoidingView plus a scroll container, which is what
        docs/mobile/phase-4-commerce-flows.md §2 asks to try before taking
        `react-native-keyboard-controller` (rule 12). `padding` on iOS and
        nothing on Android: Android's windowSoftInputMode already resizes the
        window, and stacking `height` on top of that double-counts the inset
        and leaves a gap the size of the keyboard above the tab bar.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          // A tap on Submit while the keyboard is open should press Submit,
          // not merely dismiss the keyboard and make the customer tap twice.
          keyboardShouldPersistTaps="handled"
        >
          <Eyebrow>Write a review</Eyebrow>
          <Text accessibilityRole="header" style={styles.h1}>
            {productName ?? "This product"}
          </Text>
          <Text style={styles.lead}>
            You received this, so you know something we do not. What helps the
            next person is how you cooked with it and how it compared to what
            you usually buy.
          </Text>

          <SoilLine />

          {/* ---------- rating ---------- */}
          <Eyebrow>
            {productName === null ? "Your rating" : `Your rating of ${productName}`}
          </Eyebrow>
          <View accessibilityRole="radiogroup" style={styles.ratingRow}>
            {RATINGS.map((value) => {
              const withinFill = value <= rating;
              return (
                <Pressable
                  key={value}
                  onPress={() => setRating(value)}
                  // radio, not button: these are one choice among five, and a
                  // reader announcing "button" five times gives no clue that
                  // picking one unpicks the others. Same choice as the pack
                  // selector on the product screen.
                  accessibilityRole="radio"
                  accessibilityState={{ checked: rating === value }}
                  accessibilityLabel={`${value} out of 5`}
                  android_ripple={{ color: color.green200 }}
                  style={[
                    styles.ratingButton,
                    withinFill && styles.ratingButtonFilled,
                    rating === value && styles.ratingButtonChosen,
                  ]}
                >
                  <Text style={styles.ratingNumber}>{value}</Text>
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      styles.ratingMark,
                      withinFill ? styles.ratingMarkFilled : styles.ratingMarkEmpty,
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint} accessibilityLiveRegion="polite">
            {rating === 0
              ? "No rating chosen yet. Five is the best."
              : `${rating} out of 5. Five is the best.`}
          </Text>
          {ratingError !== null && <Text style={styles.fieldError}>{ratingError}</Text>}

          {/* ---------- headline ---------- */}
          {/* A visible label on every input, always. A placeholder is not a
              label; it disappears exactly when the customer needs it. */}
          <Eyebrow style={styles.label}>Headline</Eyebrow>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            accessibilityLabel="Headline"
            accessibilityHint="A few words summing up your review"
            placeholder="In a few words"
            placeholderTextColor={color.green700}
            style={[styles.input, titleError !== null && styles.inputError]}
            returnKeyType="next"
          />
          {/* Errors sit next to the field, not only in a summary at the top. */}
          {titleError !== null && <Text style={styles.fieldError}>{titleError}</Text>}

          {/* ---------- body ---------- */}
          <Eyebrow style={styles.label}>Your review</Eyebrow>
          <TextInput
            value={body}
            onChangeText={setBody}
            maxLength={2000}
            multiline
            numberOfLines={6}
            accessibilityLabel="Your review"
            accessibilityHint="How you used it, and how it compared to what you usually buy"
            placeholder="How did you use it? How did it compare to what you usually buy?"
            placeholderTextColor={color.green700}
            style={[
              styles.input,
              styles.textArea,
              bodyError !== null && styles.inputError,
            ]}
            textAlignVertical="top"
          />
          {bodyError !== null && <Text style={styles.fieldError}>{bodyError}</Text>}

          {/* ---------- FSSAI notice ---------- */}
          {fssaiNotice !== null && (
            <View accessibilityLiveRegion="polite" style={styles.notice}>
              <Text style={styles.noticeText}>{fssaiNotice}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Button
              onPress={onSubmit}
              size="lg"
              disabled={send === "sending"}
              accessibilityHint="Sends your review to be read before it is published"
            >
              {send === "sending" ? "Sending…" : "Submit review"}
            </Button>
            <Button variant="secondary" onPress={goBack} disabled={send === "sending"}>
              Cancel
            </Button>
          </View>

          {send === "error" && (
            <View accessibilityLiveRegion="polite">
              <Text style={styles.refusal}>{message}</Text>
            </View>
          )}

          <Text style={styles.footNote}>
            Nothing goes up unread. Published reviews show your first name and
            the initial of your surname — never your full name, your address or
            your order number.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    paddingHorizontal: space.x5,
    paddingTop: space.x5,
    paddingBottom: space.x16,
  },
  h1: {
    marginTop: space.x5,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  lead: {
    marginTop: space.x4,
    marginBottom: space.x8,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  body: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },

  ratingRow: {
    marginTop: space.x4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.x2,
  },
  ratingButton: {
    // 44x44 is the floor from rule 11, and a rating picker is the control
    // most often drawn at 32 and then apologised for.
    minWidth: space.x11,
    minHeight: space.x11,
    alignItems: "center",
    justifyContent: "center",
    gap: space.x1_5,
    paddingHorizontal: space.x3,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  // The chosen value is marked by a field change, a border change AND the
  // accessibility state above — never by colour alone.
  ratingButtonFilled: { backgroundColor: color.gold100 },
  ratingButtonChosen: { borderColor: color.green900 },
  ratingNumber: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t17,
    color: color.green900,
  },
  ratingMark: { width: 14, height: 4, borderRadius: radius.full },
  ratingMarkFilled: { backgroundColor: color.gold600 },
  ratingMarkEmpty: { backgroundColor: color.green200 },

  hint: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  label: { marginTop: space.x8 },
  input: {
    marginTop: space.x2,
    minHeight: space.x11,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2_5,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.paper,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
  },
  inputError: { borderColor: color.terracotta },
  textArea: { minHeight: 140 },
  fieldError: {
    marginTop: space.x2,
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    color: color.terracotta,
  },

  notice: {
    marginTop: space.x6,
    backgroundColor: color.gold100,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderRadius: radius.sm,
  },
  noticeText: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green900,
  },
  actions: {
    marginTop: space.x8,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x4,
  },
  refusal: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.terracotta,
  },
  footNote: {
    marginTop: space.x8,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
});
