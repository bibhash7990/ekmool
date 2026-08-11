import { useCallback } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

import type { Product } from "@ekmool/core/catalog";
import { selectCartCount } from "@ekmool/core/cart";
import { formatPaise } from "@ekmool/core/money";

import {
  Button,
  Eyebrow,
  GIChip,
  PhotoPlaceholder,
  Price,
  Screen,
  SoilLine,
} from "@/components/ui";
import { useCatalog } from "@/hooks/useCachedDocument";
import { useAppSelector } from "@/store";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * Shop — the shelf, from the cached catalogue document.
 *
 * **FlatList, not FlashList.** Five products and fifteen packs: recycling
 * earns nothing here, and `@shopify/flash-list` is a dependency (rule 12)
 * bought for a list that fits on two screens. The moment the catalogue is
 * long enough for recycling to matter, this is one import and one prop —
 * and by then there will be a measurement to justify it rather than a
 * habit. `FlatList` is also what `ListHeaderComponent` lets us do here:
 * the page header scrolls with the shelf instead of pinning above it,
 * which is the web's layout and the right one on a phone too.
 *
 * Nothing on this screen is derived from anything but the catalogue. No
 * rating, no review count, no "bestseller", no "popular" — rule 5, and the
 * catalogue document deliberately carries none of those fields to derive
 * them from.
 */

/** The cheapest pack, or null when a product has no variants at all. */
function cheapestPaise(product: Product): number | null {
  return product.variants.reduce<number | null>(
    (min, variant) =>
      min === null || variant.pricePaise < min ? variant.pricePaise : min,
    null,
  );
}

/**
 * The art direction for the shot that belongs in this slot.
 *
 * The web reads a hand-written `heroArtDirection` out of
 * `apps/web/src/content/products.ts`, which is editorial copy in the web
 * app and not in a shared package. The catalogue document does carry the
 * image rows, and their `altText` is the same sentence written for the same
 * photograph — so the phone uses that, and falls back to the same generic
 * line the web falls back to for a product with no editorial entry.
 */
function artDirection(product: Product): string {
  const primary =
    product.images.find((image) => image.isPrimary) ?? product.images[0];
  if (primary && primary.altText.trim().length > 0) return primary.altText;
  return `Product photography for ${product.name}: overhead, warm natural light, regional props only.`;
}

const ACCENT_RULE = {
  gold: color.gold500,
  terracotta: color.terracotta,
  green: color.green700,
} as const;

function ProductCard({ product }: { product: Product }) {
  const cheapest = cheapestPaise(product);
  const packRange = product.variants
    .map((variant) => variant.packSizeLabel)
    .join(" · ");

  const open = useCallback(() => {
    // The object form rather than a template literal: `typedRoutes` is on in
    // app.config.js, and this is the shape that typechecks whether or not
    // .expo/types has been generated in the checkout doing the build.
    router.push({ pathname: "/product/[slug]", params: { slug: product.slug } });
  }, [product.slug]);

  return (
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
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* The per-product accent rule that makes a card read as a spice-tin
          label. Decorative, so it is hidden from the reader. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.accentRule, { backgroundColor: ACCENT_RULE[product.accent] }]}
      />

      <PhotoPlaceholder
        ratio={4 / 3}
        tone={product.accent}
        direction={artDirection(product)}
      />

      <View style={styles.cardBody}>
        <View style={styles.originRow}>
          <Eyebrow>{product.originState}</Eyebrow>
          <GIChip label={product.giTagName} />
        </View>

        <Text style={styles.cardTitle}>{product.name}</Text>
        <Text style={styles.cardBlurb}>{product.shortDescription}</Text>

        <View style={styles.cardFoot}>
          <Text style={styles.packRange}>{packRange}</Text>
          {cheapest !== null && (
            <View style={styles.priceRow}>
              <Text style={styles.fromLabel}>from</Text>
              <Price paise={cheapest} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function ShopScreen() {
  const { data, state, refresh } = useCatalog();
  const cartCount = useAppSelector(selectCartCount);

  const products = data?.products ?? [];

  const openCart = useCallback(() => {
    router.push("/cart");
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Product>) => <ProductCard product={item} />,
    [],
  );

  const header = (
    <View>
      <Eyebrow>Five origins · Fifteen pack sizes</Eyebrow>
      <Text accessibilityRole="header" style={styles.h1}>
        The whole shelf.
      </Text>
      <Text style={styles.lead}>
        Everything we sell carries a Geographical Indication and comes from the
        district that earned it. No blends, no house masalas, no substitutions
        when a season runs short.
      </Text>

      <View style={styles.basketRow}>
        <Button
          variant="secondary"
          onPress={openCart}
          accessibilityLabel={
            cartCount === 0
              ? "Basket, empty"
              : `Basket, ${cartCount} ${cartCount === 1 ? "item" : "items"}`
          }
        >
          {cartCount === 0 ? "Basket" : `Basket · ${cartCount}`}
        </Button>
      </View>

      {/*
        Offline is a state, not an error, so it is a line of text above a
        working shelf rather than a screen instead of one. accessibilityLive
        Region is Android-only — iOS announces a newly mounted element that
        receives focus, and a banner that appears above the list the reader
        is already in does get read there. Nothing here is time-critical
        enough to warrant announceForAccessibility interrupting the reader.
      */}
      {state === "offline" && products.length > 0 && (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Text style={styles.noticeText}>
            No connection. This is the copy of the shelf saved on this phone —
            prices and stock are confirmed again when you order.
          </Text>
        </View>
      )}

      <SoilLine />
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={products}
        keyExtractor={(product) => product.slug}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          // A cold start with no cache and no network. It says what is wrong
          // and offers the retry — deliberately not a spinner, which would
          // sit there forever promising something that is not coming.
          <View style={styles.empty}>
            <Text accessibilityRole="header" style={styles.emptyHeading}>
              The shelf has not been downloaded yet.
            </Text>
            <Text style={styles.emptyBody}>
              This phone has no saved copy of the catalogue, and it cannot reach
              ekmool.in at the moment. Connect to a network and try again — once
              the shelf has arrived once, it stays readable without a signal.
            </Text>
            <View style={styles.emptyAction}>
              <Button onPress={refresh}>Try again</Button>
            </View>
          </View>
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
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  lead: {
    marginTop: space.x4,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  basketRow: {
    marginTop: space.x6,
    flexDirection: "row",
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
    borderWidth: 1,
    borderColor: color.green200,
    backgroundColor: color.paper,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  // Opacity only, and instant — the design system allows colour and opacity
  // transitions of 150-300ms, and a press state that animates is a press
  // state that lags behind the finger.
  cardPressed: { opacity: 0.85 },
  accentRule: { height: 3, width: "100%" },
  cardBody: { padding: space.x5 },
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
  cardFoot: {
    marginTop: space.x5,
    paddingTop: space.x4,
    borderTopWidth: 1,
    borderTopColor: color.green200,
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
  priceRow: { flexDirection: "row", alignItems: "center", gap: space.x1_5 },
  fromLabel: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
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
