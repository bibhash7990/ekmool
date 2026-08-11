import { Fragment, type ReactNode, useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import type { ContentDocument } from "@ekmool/contracts/documents";
import { DELIVERY_ZONES, DISPATCH_DAYS } from "@ekmool/core/serviceability";

import { Button, Eyebrow, Screen, SoilLine } from "@/components/ui";
import { useCachedDocument } from "@/hooks/useCachedDocument";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * The legal and editorial pages, rendered from `content-v1.json`.
 *
 * The app must show the same privacy policy as the site. Shipping its own
 * copy would mean the two diverge the first time the owner edits one, and a
 * privacy policy that differs by device is a compliance problem before it
 * is a content problem — so the strings come from the same document the
 * admin edits, keyed exactly as `apps/web/src/content/defaults.ts` keys
 * them.
 *
 * THE MARKDOWN RENDERER, AND WHY IT IS NOT THE WEB'S
 *
 * `apps/web/src/lib/markdown.ts` was read before this was written. It is a
 * hand-written renderer with no markdown dependency of its own — but it is
 * not portable: it opens with `import "server-only"`, builds React elements
 * through `next/link`, and parses with `unified` + `remark-parse` +
 * `remark-gfm`, none of which are installed in this app. Installing three
 * packages to render four policy pages would need approval under rule 12,
 * and it would put a parser in the bundle of an app whose size budget is
 * the subject of Phase 5.
 *
 * So this is a minimal renderer, matched to what the content actually
 * contains rather than to CommonMark. Checked against
 * `apps/web/src/content/defaults.ts`, every policy body uses exactly four
 * constructs: paragraphs, `- ` bullet lists, `**strong**`, and
 * `[text](/site-path)` links. There are no headings, no ordered lists, no
 * images, no tables and no raw HTML in any of them.
 *
 * The web renderer's central property is kept: **there is no HTML string
 * anywhere**, so there is nothing to sanitise. Anything this does not
 * recognise renders as the text it is written as, which is the safe
 * direction to fail for a legal page — a clause never disappears, it only
 * loses its formatting.
 */

/* ------------------------------------------------------------------ */
/* The pages                                                           */

interface PageSpec {
  /** The `<h1>`, and it is not editable — the same rule the web applies. */
  title: string;
  /** The `policy.<prefix>.` namespace in the content document. */
  prefix: string;
  /** Section order. A key with no value in the document is skipped. */
  sections: readonly string[];
}

/**
 * Route key to page. The route key is short (`/content/refund`) rather than
 * the web's path (`/refund-policy`) because it is also the lookup into the
 * content document's namespace, and one string that means one thing beats
 * two that have to be kept in step.
 */
/*
 * Typed with `| undefined` in the value, deliberately: without
 * `noUncheckedIndexedAccess` a `Record<string, PageSpec>` lookup is typed
 * `PageSpec` however unknown the key, and the `=== undefined` guard below
 * would be a compile error over a check that is doing real work at runtime.
 * The route parameter is whatever is in the URL bar.
 */
const PAGES: Record<string, PageSpec | undefined> = {
  privacy: {
    title: "Privacy Policy",
    prefix: "privacy",
    sections: [
      "collect",
      "notcollect",
      "analytics",
      "sharing",
      "retention",
      "cookies",
      "rights",
      "security",
      "changes",
    ],
  },
  terms: {
    title: "Terms of Service",
    prefix: "terms",
    sections: [
      "parties",
      "formation",
      "pricing",
      "descriptions",
      "delivery",
      "responsibilities",
      "ip",
      "liability",
      "availability",
      "law",
    ],
  },
  refund: {
    title: "Refund & Returns Policy",
    prefix: "refund",
    sections: [
      "short",
      "damaged",
      "sealed",
      "opened",
      "cancellations",
      "how",
      "excluded",
      "rights",
    ],
  },
  shipping: {
    title: "Shipping Policy",
    prefix: "shipping",
    // "times" is absent here and rendered separately below: it wraps the
    // delivery-zone table, which is not editable copy. Same split as
    // apps/web/src/app/shipping-policy/page.tsx, for the same reason — a
    // policy and the PIN code checker quoting different numbers is how a
    // shop ends up with a promise it did not know it had made.
    sections: ["where", "charges"],
  },
};

const SHIPPING_AFTER_TIMES = [
  "tracking",
  "packaging",
  "failed",
  "damage",
  "questions",
] as const;

/**
 * Site paths this app can actually open. Everything else renders as words.
 *
 * The web's renderer refuses a URL it cannot trust and renders the link's
 * text rather than nothing, because deleting the words would make a policy
 * sentence read as though a clause had been removed. The phone has the same
 * problem for a different reason — `/contact` is a page on the site and not
 * a screen in this app — and takes the same answer. A link that navigates
 * nowhere is worse than a sentence that is merely not a link.
 */
const INTERNAL_ROUTES: Record<string, string | undefined> = {
  "/privacy-policy": "privacy",
  "/terms": "terms",
  "/refund-policy": "refund",
  "/shipping-policy": "shipping",
};

/* ------------------------------------------------------------------ */
/* The renderer                                                        */

/** `**strong**` or `[text](href)`. Nothing else is inline in this content. */
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function InlineRuns({ source }: { source: string }): ReactNode {
  const runs: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  INLINE.lastIndex = 0;
  let match = INLINE.exec(source);
  while (match !== null) {
    if (match.index > cursor) {
      runs.push(
        <Fragment key={`t${index}`}>{source.slice(cursor, match.index)}</Fragment>,
      );
      index += 1;
    }

    // Annotated rather than destructured: an unmatched alternative in a
    // RegExpExecArray is `undefined` at runtime, and the group indexes are
    // typed `string`, so the guards below need to be told the truth.
    const whole: string = match[0];
    const strong: string | undefined = match[1];
    const linkText: string | undefined = match[2];
    const href: string | undefined = match[3];

    if (strong !== undefined) {
      runs.push(
        <Text key={`s${index}`} style={styles.strong}>
          {strong}
        </Text>,
      );
    } else if (linkText !== undefined && href !== undefined) {
      const target = INTERNAL_ROUTES[href];
      runs.push(
        target === undefined ? (
          <Fragment key={`l${index}`}>{linkText}</Fragment>
        ) : (
          <Text
            key={`l${index}`}
            accessibilityRole="link"
            style={styles.link}
            onPress={() =>
              router.push({
                pathname: "/content/[key]",
                params: { key: target },
              })
            }
          >
            {linkText}
          </Text>
        ),
      );
    }

    index += 1;
    cursor = match.index + whole.length;
    match = INLINE.exec(source);
  }

  if (cursor < source.length) {
    runs.push(<Fragment key={`t${index}`}>{source.slice(cursor)}</Fragment>);
  }

  return runs;
}

/**
 * Blocks are separated by a blank line; a block whose every line starts
 * with `- ` is a list, and anything else is a paragraph whose soft wraps
 * are joined with a space, which is what markdown does with them.
 */
function Markdown({ source }: { source: string }): ReactNode {
  return source
    .split(/\n{2,}/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((block, blockIndex) => {
      const lines = block.split("\n").map((line) => line.trim());

      if (lines.every((line) => line.startsWith("- "))) {
        return (
          <View key={blockIndex} style={styles.list}>
            {lines.map((line, itemIndex) => (
              <View key={itemIndex} style={styles.listItem}>
                <Text style={styles.bullet}>{"•"}</Text>
                <Text style={styles.listText}>
                  <InlineRuns source={line.slice(2)} />
                </Text>
              </View>
            ))}
          </View>
        );
      }

      return (
        <Text key={blockIndex} style={styles.paragraph}>
          <InlineRuns source={lines.join(" ")} />
        </Text>
      );
    });
}

/* ------------------------------------------------------------------ */

function Section({ heading, body }: { heading?: string; body?: string }) {
  if (body === undefined) return null;
  return (
    <View style={styles.section}>
      {heading !== undefined && (
        <Text accessibilityRole="header" style={styles.h2}>
          {heading}
        </Text>
      )}
      <Markdown source={body} />
    </View>
  );
}

export default function ContentScreen() {
  const params = useLocalSearchParams<{ key: string | string[] }>();
  // A repeated parameter arrives as an array; take the first. The `?? ""`
  // is for the runtime, where a missing parameter is undefined however the
  // type reads — and "" is not a page, so it falls through to the copy
  // below rather than indexing with `undefined`.
  const key = (Array.isArray(params.key) ? params.key[0] : params.key) ?? "";
  const page = PAGES[key];

  const { data, state, refresh } = useCachedDocument<ContentDocument>(
    "/catalog/content-v1.json",
    "content",
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  if (page === undefined) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.h1}>
            There is no page here.
          </Text>
          <Text style={styles.paragraph}>
            The app knows four documents: the privacy policy, the terms of
            service, the refund policy and the shipping policy.
          </Text>
          <View style={styles.actions}>
            <Button onPress={goBack}>Go back</Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  if (data === null) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.h1}>
            {page.title}
          </Text>
          <Text style={styles.paragraph}>
            This phone has not downloaded the policy documents yet, and it
            cannot reach ekmool.in at the moment. They are on the website in
            full. Connect to a network and try again — once they have arrived
            once, they stay readable without a signal.
          </Text>
          <View style={styles.actions}>
            <Button onPress={refresh}>Try again</Button>
            <Button variant="secondary" onPress={goBack}>
              Go back
            </Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const values: Record<string, string> = data.values;

  /**
   * A key with no value is a section that does not render — not a section
   * with the word "undefined" in it.
   *
   * The contract types `values` as `Record<string, string>` on purpose (the
   * key set grows whenever someone makes a string editable, and a client
   * built against last quarter's union would fail to compile against a
   * document that merely gained a key). Without
   * `noUncheckedIndexedAccess`, that index signature is typed as always
   * present, so the missing case has to be tested at runtime rather than
   * trusted from the type.
   */
  const t = (suffix: string): string | undefined => {
    const value: string | undefined = values[`policy.${page.prefix}.${suffix}`];
    return typeof value === "string" && value.trim().length > 0
      ? value
      : undefined;
  };

  const standfirst = t("standfirst");
  const updated = t("updated");
  const timesHeading = t("times.heading");
  const timesBefore = t("times.before");
  const timesAfter = t("times.after");

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Ekmool policies</Eyebrow>
        <Text accessibilityRole="header" style={styles.h1}>
          {page.title}
        </Text>
        {standfirst !== undefined && (
          <Text style={styles.standfirst}>{standfirst}</Text>
        )}
        {updated !== undefined && (
          <Text style={styles.updated}>Last updated {updated}</Text>
        )}

        {state === "offline" && (
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeText}>
              No connection. This is the copy saved on this phone; the version
              on ekmool.in is the current one.
            </Text>
          </View>
        )}

        <SoilLine />

        {page.sections.map((section) => (
          <Section
            key={section}
            heading={t(`${section}.heading`)}
            body={t(`${section}.body`)}
          />
        ))}

        {page.prefix === "shipping" && (
          <View style={styles.section}>
            {timesHeading !== undefined && (
              <Text accessibilityRole="header" style={styles.h2}>
                {timesHeading}
              </Text>
            )}
            {timesBefore !== undefined && <Markdown source={timesBefore} />}

            {/*
              Not editable, and not copied. The zones come from
              @ekmool/core/serviceability — the same table the PIN code
              checker on the web reads — so the app cannot quote a delivery
              window the shop does not stand behind.
            */}
            <View style={styles.list}>
              {Object.values(DELIVERY_ZONES).map((zone) => (
                <View key={zone.id} style={styles.listItem}>
                  <Text style={styles.bullet}>{"•"}</Text>
                  <Text style={styles.listText}>
                    {zone.label} — {zone.minDays} to {zone.maxDays} working days
                  </Text>
                </View>
              ))}
            </View>
            <Text style={styles.paragraph}>
              The PIN code checker adds the {DISPATCH_DAYS} working day for
              packing and gives you the total, so the figure it shows is from
              the moment you order rather than from dispatch.
            </Text>

            {timesAfter !== undefined && <Markdown source={timesAfter} />}
          </View>
        )}

        {page.prefix === "shipping" &&
          SHIPPING_AFTER_TIMES.map((section) => (
            <Section
              key={section}
              heading={t(`${section}.heading`)}
              body={t(`${section}.body`)}
            />
          ))}
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
    marginBottom: space.x3,
    fontFamily: font.display,
    ...typeScale.t20,
    color: color.green900,
  },
  standfirst: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t20,
    color: color.green700,
  },
  updated: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  notice: {
    marginTop: space.x5,
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
  section: { marginTop: space.x8 },
  paragraph: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  strong: { fontFamily: font.bodySemiBold, color: color.green900 },
  // An inline link inside prose, not a control: rule 11's 44pt floor is for
  // buttons, inputs and link-buttons, and padding a run of words inside a
  // paragraph to 44pt would break the line box it lives in. gold-800 is the
  // only gold that clears 4.5:1 as ink, and the underline means colour is
  // not the only signal.
  link: {
    fontFamily: font.bodyMedium,
    color: color.gold800,
    textDecorationLine: "underline",
  },
  list: { marginTop: space.x4 },
  listItem: { flexDirection: "row", gap: space.x2, marginTop: space.x2 },
  bullet: {
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.gold800,
  },
  listText: {
    flex: 1,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  actions: {
    marginTop: space.x7,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.x4,
  },
});
