import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import type { ProductReviewsEntry } from "@ekmool/contracts/documents";
import type { Product } from "@ekmool/core/catalog";
import { formatPaise } from "@ekmool/core/money";

import { reviewsForProduct } from "@/api/reviews";
import {
  removeFromWishlist,
  syncWishlistOnOpen,
  useWishlist,
} from "@/api/wishlist";
import { ProductRating } from "@/components/reviews/ProductRating";
import { Button, Eyebrow, GIChip, Price, Screen, SoilLine } from "@/components/ui";
import { useCatalog, useReviews } from "@/hooks/useCachedDocument";
import { peekSession, subscribeToSession, loadSession } from "@/lib/session";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * Saved — the list, kept on this phone, reconciled with an account only if
 * one already exists.
 *
 * ── The line this screen must not cross ──
 *
 * **Nothing here offers "sign in and we will keep your list safe".** That
 * sentence is registration with the word registration removed, and rule 7
 * says there is no registration and there never will be one. The account
 * copy appears only for somebody who is *already* identified — they looked
 * up an order, which is the one door — and for everybody else the honest
 * statement is that the list lives on this phone, said plainly and without
 * an offer attached to it.
 *
 * The previous version of this screen refused to draw a save control at all,
 * on the grounds that where the list would live had not been decided. It has
 * now: `src/api/wishlist.ts`, device-first, account-second.
 *
 * ── Ratings on a saved card ──
 *
 * `ProductRating` is mounted here, which means a saved product that nobody
 * has reviewed shows **nothing** — no marks, no "0.0", no gap where a rating
 * would be. That is rule 5 and it is the whole point; see the header comment
 * on that component. This screen is currently the only place in the app that
 * renders a rating at all, which makes it the place to look when checking
 * the rule by hand.
 */

const ACCENT_RULE = {
  gold: color.gold500,
  terracotta: color.terracotta,
  green: color.green700,
} as const;

/** The cheapest pack, or null when a product has no variants at all. */
function cheapestPaise(product: Product): number | null {
  return product.variants.reduce<number | null>(
    (min, variant) =>
      min === null || variant.pricePaise < min ? variant.pricePaise : min,
    null,
  );
}

/* ------------------------------------------------------------------ */

type SavedCardProps = {
  product: Product;
  /** Null for a product nobody has reviewed. ProductRating draws nothing. */
  rating: ProductReviewsEntry | null;
  onRemove: (slug: string) => void;
};

function SavedCard({ product, rating, onRemove }: SavedCardProps) {
  const cheapest = cheapestPaise(product);
  const packRange = product.variants
    .map((variant) => variant.packSizeLabel)
    .join(" · ");

  const open = useCallback(() => {
    // The object form rather than a template literal, for the reason the
    // shelf screen gives: `typedRoutes` is on, and this shape typechecks
    // whether or not `.expo/types` has been generated in this checkout.
    router.push({ pathname: "/product/[slug]", params: { slug: product.slug } });
  }, [product.slug]);

  const remove = useCallback(() => {
    onRemove(product.slug);
  }, [onRemove, product.slug]);

  return (
    // The card is a plain View and the two actions are siblings inside it.
    // A Pressable card with a Pressable Remove nested in it is the obvious
    // layout and the wrong one: nested pressables flatten unpredictably for
    // a screen reader, and the customer gets one node whose name is the
    // product and whose action is anybody's guess.
    <View style={styles.card}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.accentRule, { backgroundColor: ACCENT_RULE[product.accent] }]}
      />

      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={
          cheapest === null
            ? `${product.name}. ${product.originState}.`
            : `${product.name}. ${product.originState}. From ${formatPaise(cheapest)}.`
        }
        accessibilityHint="Opens the product"
        android_ripple={{ color: color.green200 }}
        style={({ pressed }) => [styles.cardBody, pressed && styles.pressed]}
      >
        <View style={styles.originRow}>
          <Eyebrow>{product.originState}</Eyebrow>
          <GIChip label={product.giTagName} />
        </View>

        <Text style={styles.cardTitle}>{product.name}</Text>
        <Text style={styles.cardBlurb}>{product.shortDescription}</Text>

        {/* Rule 5: renders nothing at all when nobody has reviewed this. */}
        <ProductRating entry={rating} style={styles.cardRating} />

        <View style={styles.priceRow}>
          <Text style={styles.packRange}>{packRange}</Text>
          {cheapest !== null && (
            <View style={styles.fromRow}>
              <Text style={styles.fromLabel}>from</Text>
              <Price paise={cheapest} />
            </View>
          )}
        </View>
      </Pressable>

      <View style={styles.cardFoot}>
        <Text style={styles.footNote}>Nothing is reserved and no price is held.</Text>
        <Pressable
          onPress={remove}
          accessibilityRole="button"
          // The visible word is "Remove"; the spoken name says what is being
          // removed and from where, because a screen reader moving down a
          // list of five cards otherwise hears "Remove" five times.
          accessibilityLabel={`Remove ${product.name} from your saved list`}
          android_ripple={{ color: color.green200 }}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <Text style={styles.removeLabel}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

type SyncState = "none" | "syncing" | "synced" | "failed";

export default function SavedScreen() {
  const saved = useWishlist();
  const { data: catalog } = useCatalog();
  const { data: reviews } = useReviews();

  const [signedIn, setSignedIn] = useState(() => peekSession() !== null);
  const [sync, setSync] = useState<SyncState>("none");
  const syncStarted = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToSession((session) => {
      setSignedIn(session !== null);
    });
    // `peekSession` is an optimisation and says so in its own doc comment —
    // it is null before anything has read the keystore. This makes it
    // truthful, and publishes to the subscriber above if it moved.
    void loadSession();
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Once per mount, not once per render and not on every focus. The merge
    // is a union: running it repeatedly is harmless on the server and
    // pointless on the wire.
    if (syncStarted.current) return;
    syncStarted.current = true;

    void (async () => {
      setSync("syncing");
      const result = await syncWishlistOnOpen();
      // `null` means no session — nothing to reconcile, and not a failure.
      if (result === null) {
        setSync("none");
        return;
      }
      setSync(result.ok ? "synced" : "failed");
    })();
  }, []);

  const onRemove = useCallback((slug: string) => {
    removeFromWishlist(slug);
  }, []);

  const openShelf = useCallback(() => {
    // `navigate`, not `push`. The shelf is a sibling tab that is already in
    // the history — pushing it would stack a second copy of the Shop screen
    // on top of the tab group, and the back gesture would then land on Saved
    // rather than leaving the app.
    router.navigate("/");
  }, []);

  const products = catalog?.products ?? [];
  // Ordered by the saved list, not by the catalogue: newest saved first is
  // what the customer put there.
  const visible = saved
    .map((slug) => products.find((product) => product.slug === slug))
    .filter((product): product is Product => product !== undefined);

  /** Saved, but the catalogue on this phone has never been downloaded. */
  const awaitingCatalogue = saved.length > 0 && catalog === null;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Product>) => (
      <SavedCard
        product={item}
        rating={reviewsForProduct(reviews, item.slug)}
        onRemove={onRemove}
      />
    ),
    [onRemove, reviews],
  );

  /**
   * Where the list lives, in one sentence, always true.
   *
   * Four states rather than two, because "kept on your account" is a claim
   * and it is only true once the merge has actually landed. A signed-in
   * customer on a bad connection is told the truth — the list is on the
   * phone and has not been matched yet — rather than a comfortable sentence
   * about an account the app could not reach.
   */
  function whereItLives(): string {
    if (!signedIn) {
      return "Kept on this phone. Nothing is sent anywhere.";
    }
    if (sync === "syncing") {
      return "Kept on this phone. Checking your account for saved items…";
    }
    if (sync === "failed") {
      return "Kept on this phone. Your account could not be reached just now, so the two lists have not been matched yet.";
    }
    return "Kept on your account, so the list follows you to a new phone.";
  }

  const header = (
    <View>
      <Eyebrow>Saved for later</Eyebrow>
      <Text accessibilityRole="header" style={styles.h1}>
        Your list.
      </Text>

      {saved.length > 0 && (
        <View accessibilityLiveRegion="polite" style={styles.statusRow}>
          <Text style={styles.status}>
            {`${saved.length} saved · ${whereItLives()}`}
          </Text>
        </View>
      )}

      <SoilLine />

      {awaitingCatalogue && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {saved.length === 1
              ? "One product is on your list, but the shelf has not been downloaded to this phone yet, so there is nothing to show it with. Connect to a network and open the Shop tab once."
              : `${saved.length} products are on your list, but the shelf has not been downloaded to this phone yet, so there is nothing to show them with. Connect to a network and open the Shop tab once.`}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={visible}
        keyExtractor={(product) => product.slug}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          awaitingCatalogue ? null : (
            <View style={styles.empty}>
              <Text accessibilityRole="header" style={styles.emptyHeading}>
                Nothing saved yet.
              </Text>
              <Text style={styles.emptyBody}>
                Saved products are listed here with their pack sizes and price.
                Nothing is reserved and no price is held: it is a note to
                yourself, kept where you left it.
              </Text>
              <Text style={styles.emptyBody}>
                {signedIn
                  ? "Anything saved on the website is here too — the account you looked your order up with holds one list, and this phone reads it."
                  : "This list is kept on this phone and is not sent anywhere. A list saved on the website stays there; there is no account joining the two, and nothing here asks you to make one."}
              </Text>
              <View style={styles.emptyAction}>
                <Button onPress={openShelf}>Go to the shelf</Button>
              </View>
            </View>
          )
        }
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: space.x5,
    paddingTop: space.x6,
    paddingBottom: space.x16,
  },
  h1: {
    marginTop: space.x5,
    marginBottom: space.x5,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  statusRow: { marginBottom: space.x6 },
  status: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
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
  separator: { height: space.x8 },

  card: {
    marginTop: space.x8,
    borderWidth: 1,
    borderColor: color.green200,
    backgroundColor: color.paper,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  accentRule: { height: 3, width: "100%" },
  cardBody: { padding: space.x5 },
  // Opacity only, and instant. The design system's 150-300ms budget is for
  // state transitions; a press indicator that animates reads as lag.
  pressed: { opacity: 0.85 },
  originRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x2,
  },
  cardTitle: {
    marginTop: space.x4,
    fontFamily: font.display,
    ...typeScale.t26,
    color: color.green900,
  },
  cardBlurb: {
    marginTop: space.x2_5,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  // Margin on the rating rather than padding inside it, so that when
  // ProductRating returns null — which is the common case and the correct
  // one — the gap goes with it and no empty band is left behind.
  cardRating: { marginTop: space.x4 },
  priceRow: {
    marginTop: space.x5,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  packRange: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  fromRow: { flexDirection: "row", alignItems: "center", gap: space.x1_5 },
  fromLabel: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  cardFoot: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
    paddingLeft: space.x5,
    borderTopWidth: 1,
    borderTopColor: color.green200,
    backgroundColor: color.cream,
  },
  footNote: {
    flex: 1,
    minWidth: 0,
    paddingVertical: space.x3,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  remove: {
    // 44pt floor, rule 11. A destructive control drawn at 32 is the most
    // common accessibility failure in a saved-items list.
    minHeight: space.x11,
    minWidth: space.x11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.x5,
  },
  removeLabel: {
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    // green-900 rather than terracotta. Removing a saved note is not an
    // error and not a warning; terracotta is the palette's error ink and
    // spending it here would leave nothing louder for a real refusal.
    color: color.green900,
    textDecorationLine: "underline",
  },

  empty: { paddingTop: space.x4 },
  emptyHeading: {
    fontFamily: font.display,
    ...typeScale.t26,
    color: color.green900,
  },
  emptyBody: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  emptyAction: { marginTop: space.x7, flexDirection: "row" },
});
