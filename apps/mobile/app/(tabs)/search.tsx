import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";

import type { Product } from "@ekmool/core/catalog";
import { formatPaise } from "@ekmool/core/money";
import { searchCatalog, suggestCorrection } from "@ekmool/core/search";

import { Button, Eyebrow, GIChip, Price, Screen } from "@/components/ui";
import { useCatalog } from "@/hooks/useCachedDocument";
import { color, font, radius, space, type as typeScale } from "@/theme";

/**
 * Search — `@ekmool/core/search`, in memory, over the cached catalogue.
 *
 * The same ranking function the web runs, so "haldi" finds turmeric and
 * "mirchi" finds chilli on both clients, and a synonym added for one is
 * added for both. It costs no request: the catalogue is already on the
 * phone, so this works on a train with no signal, which is the whole reason
 * the shared module was written to run in memory rather than as a FULLTEXT
 * query.
 *
 * Results are a list, not a grid of photographs. That is a decision rather
 * than a shortcut: a search result is scanned, and five cards each carrying
 * a 4:3 image put two answers on a phone screen where a list puts all five.
 * The shelf on the Shop tab is the surface for browsing pictures.
 */

/** The web's cap. A query longer than this is a paste, not a search. */
const MAX_QUERY_LENGTH = 80;

function cheapestPaise(product: Product): number | null {
  return product.variants.reduce<number | null>(
    (min, variant) =>
      min === null || variant.pricePaise < min ? variant.pricePaise : min,
    null,
  );
}

function ResultRow({ product }: { product: Product }) {
  const cheapest = cheapestPaise(product);

  const open = useCallback(() => {
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
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMain}>
        <Eyebrow>{product.originState}</Eyebrow>
        <Text style={styles.rowTitle}>{product.name}</Text>
        <Text style={styles.rowBlurb} numberOfLines={2}>
          {product.shortDescription}
        </Text>
        <View style={styles.rowChip}>
          <GIChip label={product.giTagName} />
        </View>
      </View>
      {cheapest !== null && (
        <View style={styles.rowPrice}>
          <Text style={styles.fromLabel}>from</Text>
          <Price paise={cheapest} />
        </View>
      )}
    </Pressable>
  );
}

export default function SearchScreen() {
  const { data, state, refresh } = useCatalog();
  const [query, setQuery] = useState("");

  const products = useMemo(() => data?.products ?? [], [data]);
  const trimmed = query.trim();

  // searchCatalog rebuilds its index per call — five products of string
  // splitting, deliberately, so a revalidated catalogue can never be
  // searched through a stale index. Memoised on the keystroke anyway, since
  // a controlled TextInput re-renders on every character.
  const hits = useMemo(
    () => (trimmed ? searchCatalog(products, trimmed) : []),
    [products, trimmed],
  );

  // An empty box shows the whole shelf. That differs from the web, where an
  // empty query returns nothing because /products is one click away — here
  // the Shop tab is a tab away, and an empty screen under a search field
  // reads as a broken search rather than as an invitation.
  const results = trimmed ? hits.map((hit) => hit.product) : products;

  const correction =
    trimmed && hits.length === 0 ? suggestCorrection(products, trimmed) : null;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Product>) => <ResultRow product={item} />,
    [],
  );

  const status = !trimmed
    ? `Everything we sell — ${products.length} ${products.length === 1 ? "product" : "products"}`
    : hits.length > 0
      ? `${hits.length} ${hits.length === 1 ? "product" : "products"}`
      : `Nothing matched “${trimmed}”`;

  const header = (
    <View>
      {/*
        A visible label, not a placeholder. A placeholder disappears exactly
        when the user needs it — rule 11 — so the label above stays and the
        placeholder carries examples instead. accessibilityLabel repeats the
        label rather than relying on aria-labelledby, which Android and iOS
        resolve differently for a TextInput.
      */}
      <Text style={styles.label}>Search the shelf</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Search the shelf"
        placeholder="Turmeric, makhana, Guntur"
        placeholderTextColor={color.green700}
        maxLength={MAX_QUERY_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={styles.input}
      />
      <Text style={styles.hint}>
        Try the Indian name too — haldi, makhana, mirchi — or a district:
        Kandhamal, Lakadong, Guntur.
      </Text>

      {state === "offline" && products.length > 0 && (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Text style={styles.noticeText}>
            No connection. Search is running on the copy of the catalogue saved
            on this phone.
          </Text>
        </View>
      )}

      {products.length > 0 && (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Text>
      )}

      {trimmed !== "" && hits.length === 0 && products.length > 0 && (
        <View style={styles.noResults}>
          {correction && (
            <Pressable
              onPress={() => setQuery(correction)}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${correction} instead`}
              style={styles.suggestion}
            >
              <Text style={styles.suggestionText}>
                Did you mean {correction}?
              </Text>
            </Pressable>
          )}
          <Text style={styles.noResultsBody}>
            We keep a deliberately short shelf: five GI-tagged foods, nothing
            blended and nothing bought in. If you were looking for something
            else, it is not that we are out of it — we do not stock it.
          </Text>
          <Text style={styles.subheading}>What we do have</Text>
        </View>
      )}
    </View>
  );

  // With no query and no hits, `results` is the whole shelf — so the list
  // below the "nothing matched" copy is the same five products the web
  // shows under "What we do have".
  const listData = trimmed && hits.length === 0 ? products : results;

  return (
    <Screen>
      <FlatList
        data={listData}
        keyExtractor={(product) => product.slug}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text accessibilityRole="header" style={styles.emptyHeading}>
              There is nothing to search yet.
            </Text>
            <Text style={styles.emptyBody}>
              Search reads the catalogue saved on this phone, and it has not
              been downloaded once. Connect to a network and try again.
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
  label: {
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    color: color.green900,
  },
  input: {
    marginTop: space.x2,
    minHeight: space.x11, // 44 — rule 11's floor, same number as min-h-11
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.cream,
    paddingHorizontal: space.x4,
    paddingVertical: space.x2_5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green900,
  },
  hint: {
    marginTop: space.x3,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  notice: {
    marginTop: space.x4,
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
  status: {
    marginTop: space.x6,
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    color: color.green700,
  },
  noResults: { marginTop: space.x4 },
  suggestion: {
    minHeight: space.x11,
    justifyContent: "center",
  },
  suggestionText: {
    fontFamily: font.bodyMedium,
    ...typeScale.t17,
    // gold-800 is the only gold that clears 4.5:1 as ink on paper.
    color: color.gold800,
    textDecorationLine: "underline",
  },
  noResultsBody: {
    marginTop: space.x2,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  subheading: {
    marginTop: space.x8,
    fontFamily: font.bodyMedium,
    ...typeScale.t15,
    color: color.green700,
  },
  separator: { height: space.x5 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.x4,
    borderWidth: 1,
    borderColor: color.green200,
    borderRadius: radius.sm,
    backgroundColor: color.paper,
    padding: space.x4,
    minHeight: space.x11,
  },
  rowPressed: { opacity: 0.85 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: {
    marginTop: space.x2,
    fontFamily: font.display,
    ...typeScale.t20,
    color: color.green900,
  },
  rowBlurb: {
    marginTop: space.x1_5,
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  rowChip: { marginTop: space.x3, flexDirection: "row" },
  rowPrice: { alignItems: "flex-end", gap: space.x1 },
  fromLabel: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
  empty: { paddingTop: space.x8 },
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
