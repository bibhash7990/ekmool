import { useCallback, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import type { Product, ProductVariant } from "@ekmool/core/catalog";
import { itemAdded, selectCartCount } from "@ekmool/core/cart";
import { formatPaise } from "@ekmool/core/money";

import { reviewsForProduct } from "@/api/reviews";
import { toggleWishlist, useWishlist } from "@/api/wishlist";
import { ProductRating } from "@/components/reviews/ProductRating";
import { ReviewList } from "@/components/reviews/ReviewList";
import {
  Button,
  Eyebrow,
  GIChip,
  PhotoPlaceholder,
  Price,
  Screen,
  SoilLine,
} from "@/components/ui";
import { useCatalog, useReviews } from "@/hooks/useCachedDocument";
import { useAppDispatch, useAppSelector } from "@/store";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * One product: origin, GI tag, the long description, the packs, the
 * saved-list control, the rating, the published reviews, and a button that
 * puts a pack in the basket.
 *
 * **There is no "Buy now".** A pack goes into the basket and the basket goes
 * to checkout, so there is one selling path and one place the totals are
 * computed — the alternative, a second express route from here, would be a
 * second implementation of the same arithmetic.
 *
 * ## Rule 5 is enforced in two components, and this screen asks them nothing
 *
 * `ProductRating` and `ReviewList` are mounted unconditionally and both
 * refuse before they draw: a product nobody has reviewed shows no rating, no
 * marks and no heading. `ReviewList` owns its own heading for exactly that
 * reason, so there is no wrapper around either of them here, no container
 * that would leave an empty band, and nothing on this screen reads
 * `entry.rating`. An earlier version of this comment said the product screen
 * deliberately showed no rating at all because the gate did not exist yet.
 * It exists — `src/components/reviews/ProductRating.tsx` — so this screen
 * mounts it rather than reimplementing the decision.
 *
 * The reviews document is read with `useReviews()`, which is the typed
 * wrapper over the same `useCachedDocument` the catalogue below uses. There
 * is deliberately no second path to review data: the static document keeps
 * serving with MySQL stopped (rule 8) and a live `GET /api/reviews/[slug]`
 * would hand that property back.
 *
 * Stock is shown only as "out of stock", never as a countdown. The
 * catalogue document is regenerated on an hourly window and this phone may
 * be holding a copy older than that, so "3 left" here would be a number
 * presented as live that is not — and rule 5 permits it only when the
 * figure is literally 3. Correctness lives in the atomic decrement at
 * checkout, exactly as it does on the web; the line under the packs says
 * so rather than implying otherwise by silence.
 */

const ACCENT_RULE = {
  gold: color.gold500,
  terracotta: color.terracotta,
  green: color.green700,
} as const;

/** IST everywhere, `en-IN` everywhere — docs/DESIGN-SYSTEM.md. */
const CATALOGUE_DATE = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

function artDirection(product: Product): string {
  const primary =
    product.images.find((image) => image.isPrimary) ?? product.images[0];
  if (primary && primary.altText.trim().length > 0) return primary.altText;
  return `Product photography for ${product.name}: overhead, warm natural light, regional props only.`;
}

function VariantRow({
  variant,
  selected,
  first,
  onSelect,
}: {
  variant: ProductVariant;
  selected: boolean;
  /** The first row sits against the container's own border — no second rule. */
  first: boolean;
  onSelect: () => void;
}) {
  const soldOut = variant.stockQty <= 0;
  const discounted = variant.mrpPaise > variant.pricePaise;

  return (
    <Pressable
      onPress={onSelect}
      disabled={soldOut}
      // radio, not button: these are one choice among several, and a screen
      // reader that announces "button" for each gives no clue that picking
      // one unpicks the others.
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: soldOut }}
      accessibilityLabel={
        soldOut
          ? `${variant.packSizeLabel}, ${formatPaise(variant.pricePaise)}, out of stock`
          : `${variant.packSizeLabel}, ${formatPaise(variant.pricePaise)}`
      }
      android_ripple={{ color: color.green200 }}
      style={[
        styles.variant,
        first && styles.variantFirst,
        selected && styles.variantSelected,
        soldOut && styles.variantSoldOut,
      ]}
    >
      <View style={styles.variantMain}>
        <Text style={styles.variantLabel}>{variant.packSizeLabel}</Text>
        <Text style={styles.variantMeta}>
          {variant.packSizeGrams} g · {variant.sku}
        </Text>
        {soldOut && <Text style={styles.variantSoldOutText}>Out of stock</Text>}
      </View>
      <View style={styles.variantPrice}>
        <Price paise={variant.pricePaise} />
        {discounted && (
          <Text style={styles.mrp}>MRP {formatPaise(variant.mrpPaise)}</Text>
        )}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* The saved mark                                                      */

/**
 * A heart, drawn as two circles and a square turned 45 degrees.
 *
 * **Rejected: an icon library.** Rule 12 — one dependency has been added
 * since v1.0.0 and it was approved first. The tab bar names SF Symbols and
 * Android drawables, which are the platform's own and ship no bytes of ours,
 * but neither is reachable from inside a screen.
 *
 * **Rejected: `react-native-svg`**, which is what the web's `HeartIcon` is.
 * `SoilLine` refused the same native module for the same reason and wrote
 * down the reversal condition: take it when there is a chart, an illustrated
 * empty state and an icon set to justify it. This is the second hand-drawn
 * mark in the app after the five rating marks, not the third.
 *
 * **Rejected: the ♥ glyph.** U+2665 is not in Figtree, so it falls back to
 * whatever the handset has — Roboto on one Android build and the colour
 * emoji font on the next, which also carries its own colour and so decides a
 * colour outside `src/theme`. The rating marks rejected ★ for exactly this.
 *
 * **Rejected: the house motif.** The rating marks are rules rather than stars
 * because a star appears nowhere else in the brand, and that argument would
 * produce some abstract gold rule here. It does not survive the control being
 * icon-only: five rules are legible next to a numeral and a buyer count, and
 * a mark nobody has seen before, with no label beside it, is not legible at
 * all. The Saved tab already shows a heart (`sf="heart"`), so this is the
 * app's own symbol for the list rather than a borrowed one.
 *
 * ## The geometry, so it can be checked rather than trusted
 *
 * A square of side `HEART_SIDE` is turned 45 degrees about its own centre —
 * React Native's default transform origin — giving a diamond of half-diagonal
 * `HEART_HALF_DIAGONAL`. A circle of diameter `HEART_SIDE` is centred on the
 * midpoint of each of the diamond's two upper edges, so each circle passes
 * exactly through that edge's two corners and bulges outward from it. At
 * `HEART_BOX` = 22 the drawn shape spans x 1.61–20.39 and y 2.42–19.58:
 * nothing overflows the box, which matters because Android clips children
 * that fall outside their parent in several layout paths (see `SoilLine`).
 *
 * `HEART_CY` sits below the box centre so that the *shape* is centred in the
 * box — the lobes reach 9.39 above the diamond's centre and the tip only 7.78
 * below it. That is what lets the hollow be a plain `scale`: React Native
 * scales about a view's centre, which is now the shape's centre too, so
 * `scale(0.72)` leaves an even ~2.4 points of ink the whole way round.
 */
const HEART_BOX = 22;
const HEART_SIDE = HEART_BOX / 2;
const HEART_HALF_DIAGONAL = (HEART_SIDE * Math.SQRT2) / 2;
const HEART_LOBE_RADIUS = HEART_SIDE / 2;
const HEART_CX = HEART_BOX / 2;
const HEART_CY =
  HEART_BOX / 2 - (HEART_HALF_DIAGONAL / 2 - HEART_LOBE_RADIUS) / 2;

function Heart({ tint, style }: { tint: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.heart, style]}>
      <View
        style={[styles.heartLobe, styles.heartLobeLeft, { backgroundColor: tint }]}
      />
      <View
        style={[styles.heartLobe, styles.heartLobeRight, { backgroundColor: tint }]}
      />
      <View style={[styles.heartBase, { backgroundColor: tint }]} />
    </View>
  );
}

/**
 * Save / unsave. **One control with two states, never two controls** — the
 * same decision `apps/web/src/components/wishlist/WishlistButton.tsx` records.
 *
 * `useWishlist()` is subscribed here rather than in the screen so that a tap
 * re-renders 44 points of heart and nothing else. The variant rows, the photo
 * placeholder and the review list are siblings of this component rather than
 * children of it, and none of them depend on the saved list.
 *
 * **Nothing here offers an account.** The list is this phone's and works with
 * no session at all — rule 7, at length in `src/api/wishlist.ts`.
 */
function SaveControl({
  slug,
  productName,
}: {
  slug: string;
  productName: string;
}) {
  const saved = useWishlist().includes(slug);

  const toggle = useCallback(() => {
    const nowSaved = toggleWishlist(slug);
    // The mark changes shape under the finger, which a sighted customer sees
    // and a screen reader does not: iOS does not re-read an element whose
    // accessible name changed after the press that changed it. Same mechanism
    // and same reason as the basket confirmation further down.
    AccessibilityInfo.announceForAccessibility(
      nowSaved
        ? `${productName} is saved to your list.`
        : `${productName} is removed from your list.`,
    );
  }, [productName, slug]);

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      // `selected`, not `checked`: this is one thing turned on and off, not
      // one choice among several. The pack selector above is the radio case.
      accessibilityState={{ selected: saved }}
      // Icon-only, so the name carries the product AND the action, and it
      // changes with the state. Without the product in it, a reader working
      // down the app hears "Save" on five different screens.
      accessibilityLabel={
        saved
          ? `Saved. Remove ${productName} from your list`
          : `Save ${productName} to your list`
      }
      // Opacity rather than `android_ripple`, which is what the rest of this
      // file uses. The unsaved mark is an ink heart with a paper-coloured
      // heart on top of it, and a ripple is painted behind a Pressable's
      // children: it would wash the ring and leave the paper centre
      // untouched. A whole-view opacity change composites the mark as the one
      // thing it is.
      style={({ pressed }) => [styles.save, pressed && styles.savePressed]}
    >
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.heart}
      >
        <Heart tint={saved ? color.terracotta : color.green900} />
        {/* The unsaved state is an OUTLINE, not a paler fill, so the two
            states differ in shape as well as colour and stay distinct for
            somebody who cannot separate terracotta from green. */}
        {!saved && <Heart tint={color.paper} style={styles.heartHollow} />}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */

export default function ProductScreen() {
  const params = useLocalSearchParams<{ slug: string | string[] }>();
  // A repeated parameter arrives as an array. Take the first rather than
  // joining, which would look up a slug nobody asked for.
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const { data, state, refresh } = useCatalog();
  // The same cache-first hook, on the document reviews live in. It is a
  // second document rather than a field on the catalogue because the two are
  // purged by different tags — one moderated review would otherwise
  // invalidate the catalogue for the whole install base. See
  // `src/api/documents.ts`.
  const { data: reviews } = useReviews();
  const dispatch = useAppDispatch();
  const cartCount = useAppSelector(selectCartCount);

  const [chosenId, setChosenId] = useState<number | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const product = data
    ? (data.products.find((entry) => entry.slug === slug) ?? null)
    : null;

  // Derived rather than synchronised in an effect: the catalogue can arrive
  // after the first render, and an effect that seeds the selection would
  // then fight a customer who tapped a pack in between.
  const available = product?.variants.filter((v) => v.stockQty > 0) ?? [];
  // Annotated: without `noUncheckedIndexedAccess`, `available[0]` is typed
  // as always present, and TypeScript would then drop the `?? null` branch
  // and make every `chosen === null` guard below a compile error over a
  // check that is doing real work — an all-sold-out product.
  const chosen: ProductVariant | null =
    product?.variants.find((v) => v.id === chosenId && v.stockQty > 0) ??
    available[0] ??
    null;

  const addToBasket = useCallback(() => {
    if (!product || !chosen) return;
    dispatch(
      itemAdded({
        variantId: chosen.id,
        sku: chosen.sku,
        productSlug: product.slug,
        productName: product.name,
        packLabel: chosen.packSizeLabel,
        unitPricePaise: chosen.pricePaise,
        mrpPaise: chosen.mrpPaise,
        accent: product.accent,
        qty: 1,
      }),
    );
    const message = `${chosen.packSizeLabel} of ${product.name} is in your basket.`;
    setAdded(message);
    // accessibilityLiveRegion below covers Android. iOS has no live region
    // for a node that is already mounted, so the announcement is made
    // explicitly — this is the one status on the phone worth interrupting
    // for, because the customer has just acted and nothing visible moved.
    AccessibilityInfo.announceForAccessibility(message);
  }, [chosen, dispatch, product]);

  const openCart = useCallback(() => {
    router.push("/cart");
  }, []);

  const openComposer = useCallback(() => {
    // The object form rather than a template literal, for the reason the
    // shelf and Saved screens give: `typedRoutes` is on, and this shape
    // typechecks whether or not `.expo/types` has been generated in this
    // checkout. The composer asks the server whether this customer may write
    // anything and refuses in the shop's own words if not — nothing on this
    // screen decides eligibility, and nothing here may.
    router.push({ pathname: "/review/[slug]", params: { slug } });
  }, [slug]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  // `data` is tested alongside `product` so the compiler carries the
  // narrowing past this point — `generatedAt` is read below, and a product
  // can only have come from a document that exists.
  if (!data || !product) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.h1}>
            {data ? "This product is not on the shelf." : "The shelf is not here yet."}
          </Text>
          <Text style={styles.body}>
            {data
              ? "It may have been retired, or the link may have a typo. The five origins are all still where you left them."
              : "This phone has no saved copy of the catalogue and cannot reach ekmool.in at the moment. Connect to a network and try again."}
          </Text>
          <View style={styles.actions}>
            {!data && <Button onPress={refresh}>Try again</Button>}
            <Button variant="secondary" onPress={goBack}>
              Back to the shelf
            </Button>
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const paragraphs = product.longDescription.split(/\n\n+/).filter(Boolean);
  const cheapest = product.variants.reduce<number | null>(
    (min, v) => (min === null || v.pricePaise < min ? v.pricePaise : min),
    null,
  );
  // One entry, read once and handed to both components. `product.slug` rather
  // than the route parameter: it is the same string, and it is the one that
  // has been matched against the catalogue.
  const reviewEntry = reviewsForProduct(reviews, product.slug);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.accentRule,
            { backgroundColor: ACCENT_RULE[product.accent] },
          ]}
        />

        <View style={styles.originRow}>
          <Eyebrow>{product.originState}</Eyebrow>
          <GIChip label={product.giTagName} />
        </View>

        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={[styles.h1, styles.titleText]}>
            {product.name}
          </Text>
          <SaveControl slug={product.slug} productName={product.name} />
        </View>
        <Text style={styles.tagline}>{product.shortDescription}</Text>

        {/*
          Rule 5. This renders NOTHING at all for a product nobody has
          reviewed — no marks, no "0.0", no gap where a rating would be. The
          margin is on the component rather than inside it so that when it
          returns null the space goes with it and no empty band is left
          behind; the same trick, for the same reason, as the Saved screen's
          cards.
        */}
        <ProductRating entry={reviewEntry} style={styles.rating} />

        <View style={styles.photo}>
          <PhotoPlaceholder
            ratio={4 / 5}
            tone={product.accent}
            direction={artDirection(product)}
          />
        </View>

        {state === "offline" && (
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Text style={styles.noticeText}>
              No connection. This is the copy of the catalogue saved on this
              phone.
            </Text>
          </View>
        )}

        {/* ---------- Packs ---------- */}
        <Text accessibilityRole="header" style={styles.h2}>
          Pack sizes
        </Text>
        <View accessibilityRole="radiogroup" style={styles.variants}>
          {product.variants.map((variant, index) => (
            <VariantRow
              key={variant.id}
              variant={variant}
              first={index === 0}
              selected={chosen?.id === variant.id}
              onSelect={() => setChosenId(variant.id)}
            />
          ))}
        </View>

        <Text style={styles.staleNote}>
          Prices and stock are from the catalogue published on{" "}
          {CATALOGUE_DATE.format(new Date(data.generatedAt))}, not read live.
          Both are checked again when the order is placed.
        </Text>

        <View style={styles.actions}>
          <Button onPress={addToBasket} size="lg" disabled={chosen === null}>
            Add to basket
          </Button>
          {cartCount > 0 && (
            <Button variant="secondary" onPress={openCart}>
              {`View basket · ${cartCount}`}
            </Button>
          )}
        </View>

        {chosen === null && (
          <Text style={styles.refusal}>
            Every pack of {product.name} was out of stock when this catalogue
            was published. Nothing can be added until it is back.
          </Text>
        )}

        {added !== null && (
          <View accessibilityLiveRegion="polite" style={styles.added}>
            <Text style={styles.addedText}>{added}</Text>
          </View>
        )}

        <SoilLine />

        {/* ---------- Origin ---------- */}
        <Eyebrow>The origin</Eyebrow>
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.body}>
            {paragraph}
          </Text>
        ))}

        {cheapest !== null && (
          <Text style={styles.footNote}>
            Pack sizes from {formatPaise(cheapest)}. Delivery times across India
            are in the shipping policy.
          </Text>
        )}

        <View style={styles.actions}>
          <Button
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: "/content/[key]",
                params: { key: "shipping" },
              })
            }
          >
            Read the shipping policy
          </Button>
        </View>

        {/* ---------- Reviews ---------- */}
        {/*
          No heading here, and no condition around this. `ReviewList` owns
          its own heading precisely so that a caller cannot draw "What buyers
          said" over a product that has nothing under it — the heading is the
          shape of social proof, and the shape is what makes a new product
          look ignored. It returns null, heading included, when there is
          nothing published.
        */}
        <ReviewList entry={reviewEntry} />

        {/*
          True whether or not a review exists, which is why it may sit outside
          the gate. It is the editorial sentence `ProductRating` asks for in
          its header comment — the shop saying what its reviews are, once, as
          copy — and not a stand-in for a rating.
        */}
        <Text style={styles.footNote}>
          Every review here comes from a delivered order containing this
          product, and every one is read before it goes up. We have never
          written one and we have never bought one.
        </Text>

        <View style={styles.actions}>
          <Button
            variant="secondary"
            onPress={openComposer}
            accessibilityHint="Opens the form, and checks first that an order of yours has been delivered"
          >
            Write a review
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.x5,
    paddingTop: space.x5,
    paddingBottom: space.x16,
  },
  accentRule: { height: 3, width: space.x16, marginBottom: space.x5 },
  originRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x2,
  },
  h1: {
    marginTop: space.x5,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  titleRow: {
    marginTop: space.x5,
    flexDirection: "row",
    // flex-start, not center: the title runs to two lines on a narrow handset
    // and a save control that drifts to the middle of a two-line heading
    // reads as belonging to neither line.
    alignItems: "flex-start",
    gap: space.x4,
  },
  // `marginTop: 0` because the row above now owns the spacing. h1 keeps its
  // own margin for the two empty states, which use it standalone.
  titleText: { flex: 1, minWidth: 0, marginTop: 0 },
  save: {
    // 44x44, rule 11. An icon-only control is the one most often drawn at the
    // size of its glyph and then apologised for.
    minWidth: space.x11,
    minHeight: space.x11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.full,
    backgroundColor: color.paper,
  },
  savePressed: { opacity: 0.7 },
  heart: { width: HEART_BOX, height: HEART_BOX },
  heartLobe: {
    position: "absolute",
    top: HEART_CY - HEART_HALF_DIAGONAL / 2 - HEART_LOBE_RADIUS,
    width: HEART_SIDE,
    height: HEART_SIDE,
    borderRadius: radius.full,
  },
  heartLobeLeft: { left: HEART_CX - HEART_HALF_DIAGONAL / 2 - HEART_LOBE_RADIUS },
  heartLobeRight: { left: HEART_CX + HEART_HALF_DIAGONAL / 2 - HEART_LOBE_RADIUS },
  heartBase: {
    position: "absolute",
    left: HEART_CX - HEART_SIDE / 2,
    top: HEART_CY - HEART_SIDE / 2,
    width: HEART_SIDE,
    height: HEART_SIDE,
    transform: [{ rotate: "45deg" }],
  },
  // The paper heart that hollows the ink one out. See the geometry note above
  // for why a bare scale is enough here.
  heartHollow: {
    position: "absolute",
    left: 0,
    top: 0,
    transform: [{ scale: 0.72 }],
  },
  rating: { marginTop: space.x5 },
  h2: {
    marginTop: space.x10,
    fontFamily: font.display,
    ...typeScale.t26,
    color: color.green900,
  },
  tagline: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t20,
    color: color.green700,
  },
  photo: { marginTop: space.x7 },
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
  variants: {
    marginTop: space.x5,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  variant: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x4,
    minHeight: space.x14, // comfortably past the 44pt floor for a list row
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderTopWidth: 1,
    borderTopColor: color.green200,
    backgroundColor: color.paper,
  },
  // The selected pack is marked by a field change AND by the accessibility
  // state above — never by colour alone.
  variantFirst: { borderTopWidth: 0 },
  variantSelected: { backgroundColor: color.gold100 },
  variantSoldOut: { opacity: 0.55 },
  variantMain: { flex: 1, minWidth: 0 },
  variantLabel: {
    fontFamily: font.bodySemiBold,
    ...typeScale.t17,
    color: color.green900,
  },
  variantMeta: {
    marginTop: space.x1,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  variantSoldOutText: {
    marginTop: space.x1,
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    color: color.terracotta,
  },
  variantPrice: { alignItems: "flex-end", gap: space.x1 },
  mrp: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
    textDecorationLine: "line-through",
  },
  staleNote: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  actions: {
    marginTop: space.x7,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.x4,
  },
  refusal: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.terracotta,
  },
  added: {
    marginTop: space.x5,
    backgroundColor: color.gold100,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
    borderRadius: radius.sm,
  },
  addedText: {
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    color: color.green900,
  },
  body: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  footNote: {
    marginTop: space.x7,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
});
