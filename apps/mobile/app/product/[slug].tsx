import { useCallback, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import type { CatalogDocument } from "@ekmool/contracts/documents";
import type { Product, ProductVariant } from "@ekmool/core/catalog";
import { itemAdded, selectCartCount } from "@ekmool/core/cart";
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
import { useCachedDocument } from "@/hooks/useCachedDocument";
import { useAppDispatch, useAppSelector } from "@/store";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * One product: origin, GI tag, the long description, the packs, and a
 * button that puts a pack in the basket.
 *
 * **There is no checkout on this screen and no path to one.** This phase
 * proves the foundation; Phase 4 adds the commerce flows. A "Buy now" that
 * led to a screen saying "coming soon" would be worse than no button.
 *
 * **There is no rating and no review count** — rule 5. The reviews document
 * exists and this screen deliberately does not read it: the product page's
 * job in this phase is the catalogue, and a rating rendered here would have
 * to answer what an unreviewed product shows (nothing at all, never a zero)
 * before it could be written honestly.
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

export default function ProductScreen() {
  const params = useLocalSearchParams<{ slug: string | string[] }>();
  // A repeated parameter arrives as an array. Take the first rather than
  // joining, which would look up a slug nobody asked for.
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const { data, state, refresh } = useCachedDocument<CatalogDocument>(
    "/catalog/v1.json",
    "catalog",
  );
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

        <Text accessibilityRole="header" style={styles.h1}>
          {product.name}
        </Text>
        <Text style={styles.tagline}>{product.shortDescription}</Text>

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
