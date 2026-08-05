import type { Product } from "@/db/queries/products";

/**
 * Catalogue search.
 *
 * Runs in memory over the same hourly-cached catalogue every browsing page
 * already reads, so a search costs no database query, works while MySQL is
 * down, and cannot be the thing that falls over at 500 requests a second.
 *
 * The plan called for a MySQL FULLTEXT index and this deliberately is not
 * one. Three reasons, in order of weight:
 *
 *  1. FULLTEXT cannot match "haldi" to turmeric, "makhana" to fox nut, or
 *     "mirchi" to chilli. Half the people shopping for Indian groceries in
 *     India type the Indian word. The synonym table below is the entire
 *     value of this feature; the index would have added none of it.
 *  2. At five products and fifteen packs, scanning is faster than parsing a
 *     query, and it happens without leaving the process.
 *  3. It keeps search on the static path. A FULLTEXT search is a database
 *     read, and a database read is the one thing browsing here never does.
 *
 * The honest limit: this is linear in catalogue size. It stays the right
 * call into the low thousands of products; past that, move matching into
 * the database (or a real index) and keep the synonym expansion in front of
 * it as a query rewriter.
 */

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */

/**
 * Folds a string to bare comparison tokens: lowercase, accents stripped,
 * anything that is not a letter or a digit treated as a separator.
 *
 * NFD splits an accented character into its base letter plus a combining
 * mark, which the following range then removes — so "chilli" and "chillí"
 * tokenise identically, as do the various spellings people paste in from
 * recipe sites.
 */
export function tokenize(input: string): string[] {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Words that carry no signal in a catalogue where every product is an
 * Indian food sold online. "india" is on the list precisely because it is
 * true of everything — a term that matches all five products discriminates
 * between none of them.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "for", "in", "on", "to", "with",
  "buy", "shop", "order", "get", "online", "price", "prices", "cost",
  "best", "top", "near", "me", "india", "indian", "pure", "real",
]);

/* ------------------------------------------------------------------ */
/* Synonyms                                                            */

/**
 * What people actually type, mapped to what the catalogue actually says.
 *
 * Every entry is either a translation, a transliteration, a documented
 * alternative name for the same thing, or a misspelling common enough to be
 * worth catching. Nothing here is aspirational: "kashmiri" is absent on
 * purpose, because Kashmiri chilli is a different Geographical Indication
 * from Byadagi and quietly returning one for the other would be selling
 * someone a thing they did not ask for.
 *
 * Keys are already tokenised, so multi-word phrases are handled by the
 * phrase pass below rather than by keys with spaces in them.
 */
const SYNONYMS: Record<string, string[]> = {
  // Turmeric
  haldi: ["turmeric"],
  haldee: ["turmeric"],
  haladi: ["turmeric"],
  halad: ["turmeric"],
  halood: ["turmeric"],
  manjal: ["turmeric"],
  arisina: ["turmeric"],
  pasupu: ["turmeric"],
  curcumin: ["turmeric"],
  turmaric: ["turmeric"],
  termeric: ["turmeric"],
  tumeric: ["turmeric"],

  // Makhana
  makana: ["makhana"],
  makhna: ["makhana"],
  makhane: ["makhana"],
  foxnut: ["makhana"],
  foxnuts: ["makhana"],
  gorgon: ["makhana"],
  phool: ["makhana"],
  lotus: ["makhana"],

  // Chilli
  chili: ["chilli"],
  chile: ["chilli"],
  chillies: ["chilli"],
  chilies: ["chilli"],
  mirch: ["chilli"],
  mirchi: ["chilli"],
  mirchhi: ["chilli"],
  menasinakai: ["chilli"],
  karam: ["chilli"],
  sannam: ["chilli", "guntur"],

  // Places, as people write them
  orissa: ["odisha"],
  odissa: ["odisha"],
  kandhmal: ["kandhamal"],
  phulbani: ["kandhamal"],
  jaintia: ["lakadong"],
  meghalya: ["meghalaya"],
  darbhanga: ["mithila"],
  madhubani: ["mithila"],
  bihari: ["bihar"],
  andhra: ["guntur"],
  byadgi: ["byadagi"],
  bedgi: ["byadagi"],

  // Category words that should reach the right shelf
  spice: ["turmeric", "chilli"],
  spices: ["turmeric", "chilli"],
  masala: ["turmeric", "chilli"],
  powder: ["powder"],
  snack: ["makhana"],
  snacks: ["makhana"],
  // Supported by the product's own spec row — Kandhamal is the one grown
  // without synthetic inputs. Not a marketing claim bolted on here.
  organic: ["kandhamal"],
};

/**
 * Phrases that only mean something whole. Matched against the joined token
 * stream before single-token expansion, so "fox nut" and "lotus seed" work
 * even though neither word alone is decisive.
 */
const PHRASES: { phrase: string; terms: string[] }[] = [
  { phrase: "fox nut", terms: ["makhana"] },
  { phrase: "fox nuts", terms: ["makhana"] },
  { phrase: "lotus seed", terms: ["makhana"] },
  { phrase: "lotus seeds", terms: ["makhana"] },
  { phrase: "puffed lotus", terms: ["makhana"] },
  { phrase: "red chilli", terms: ["chilli"] },
  { phrase: "lal mirch", terms: ["chilli"] },
  { phrase: "haldi powder", terms: ["turmeric", "powder"] },
];

/* ------------------------------------------------------------------ */
/* Matching                                                            */

const FIELD_WEIGHTS = {
  name: 10,
  giTag: 8,
  origin: 7,
  packLabel: 5,
  shortDescription: 3,
  longDescription: 1,
} as const;

/** Exact token hit scores full; a prefix hit scores a third. */
const PREFIX_FRACTION = 3;
/**
 * Both sides of a prefix comparison must be at least this long, and the
 * "both" is the half that matters.
 *
 * Pack labels tokenise to ["100", "g"], so a one-character token "g" sat on
 * every product — and `"guntur".startsWith("g")` quietly matched the whole
 * catalogue. Searching for one district returned all five, with the right
 * answer buried in the middle.
 */
const MIN_PREFIX_LENGTH = 3;

interface IndexedProduct {
  product: Product;
  /** field weight → the set of tokens that field contributed */
  fields: { weight: number; tokens: Set<string> }[];
}

/**
 * Builds the per-product token sets once per call. Rebuilt rather than
 * memoised because the catalogue object identity changes when the cache
 * revalidates, and a stale index would keep selling a retired product.
 * Five products of string splitting is not worth the invalidation bug.
 */
function indexCatalog(products: Product[]): IndexedProduct[] {
  return products.map((product) => ({
    product,
    fields: [
      { weight: FIELD_WEIGHTS.name, tokens: new Set(tokenize(product.name)) },
      { weight: FIELD_WEIGHTS.giTag, tokens: new Set(tokenize(product.giTagName)) },
      { weight: FIELD_WEIGHTS.origin, tokens: new Set(tokenize(product.originState)) },
      {
        weight: FIELD_WEIGHTS.packLabel,
        tokens: new Set(
          product.variants.flatMap((v) => tokenize(v.packSizeLabel)),
        ),
      },
      {
        weight: FIELD_WEIGHTS.shortDescription,
        tokens: new Set(tokenize(product.shortDescription)),
      },
      {
        weight: FIELD_WEIGHTS.longDescription,
        tokens: new Set(tokenize(product.longDescription)),
      },
    ],
  }));
}

/**
 * Turns raw input into the terms actually matched: stopwords dropped,
 * phrases folded, synonyms expanded. Returns the original meaningful tokens
 * alongside, because "did you mean" has to talk about what was typed.
 */
export function expandQuery(raw: string): {
  typed: string[];
  terms: string[];
} {
  const tokens = tokenize(raw);
  const joined = tokens.join(" ");

  const typed = tokens.filter((t) => !STOPWORDS.has(t));
  const terms = new Set(typed);

  for (const { phrase, terms: mapped } of PHRASES) {
    if (joined.includes(phrase)) {
      for (const term of mapped) terms.add(term);
    }
  }

  for (const token of typed) {
    for (const term of SYNONYMS[token] ?? []) terms.add(term);
  }

  return { typed, terms: [...terms] };
}

export interface SearchHit {
  product: Product;
  score: number;
  /**
   * How many terms hit a field token exactly. Ranking is on this before
   * score, and *only* exact hits count towards it — a prefix hit lands in
   * `score` alone.
   *
   * That separation is what keeps ranking sane. A prefix hit deep in a long
   * description is worth a third of one point, but if it counted as a match
   * it would outrank an exact hit on the product's own name, because
   * "matched two terms weakly" sorts above "matched one term perfectly".
   * Searching "byadgi" put Byadagi Chilli last for exactly this reason.
   */
  matched: number;
  /** Terms that only reached a prefix. Kept so a partial query still finds. */
  partial: number;
}

/**
 * Ranks the catalogue against a query. Empty query returns nothing rather
 * than everything — an empty search box is not a request to see the shelf,
 * and /products already exists for that.
 */
export function searchCatalog(
  products: Product[],
  raw: string,
): SearchHit[] {
  const { terms } = expandQuery(raw);
  if (terms.length === 0) return [];

  const hits: SearchHit[] = [];

  for (const entry of indexCatalog(products)) {
    let score = 0;
    let matched = 0;
    let partial = 0;

    for (const term of terms) {
      let best = 0;
      let exact = false;

      for (const field of entry.fields) {
        if (field.tokens.has(term)) {
          exact = true;
          best = Math.max(best, field.weight);
          continue;
        }
        if (term.length < MIN_PREFIX_LENGTH) continue;
        for (const token of field.tokens) {
          if (token.length < MIN_PREFIX_LENGTH) continue;
          if (token.startsWith(term) || term.startsWith(token)) {
            best = Math.max(best, field.weight / PREFIX_FRACTION);
            break;
          }
        }
      }

      if (best > 0) {
        score += best;
        if (exact) matched += 1;
        else partial += 1;
      }
    }

    if (matched + partial > 0) {
      hits.push({ product: entry.product, score, matched, partial });
    }
  }

  // Exact hits first, then score. "lakadong turmeric" must put Lakadong
  // above Kandhamal even though both score the word "turmeric" identically
  // on the strongest field — Lakadong matched both terms exactly.
  return hits.sort(
    (a, b) =>
      b.matched - a.matched ||
      b.score - a.score ||
      a.product.name.localeCompare(b.product.name),
  );
}

/* ------------------------------------------------------------------ */
/* Did you mean                                                        */

/**
 * Damerau-free Levenshtein, capped: anything past `max` stops early rather
 * than computing an exact distance nobody will use.
 */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }

  return previous[b.length];
}

/**
 * Every word worth correcting towards: the synonym keys plus the catalogue's
 * own vocabulary. Rebuilt per call for the same reason the index is — a
 * cached copy would outlive the catalogue it was built from — and it only
 * runs on the zero-results path, which by definition nobody is waiting on.
 */
function buildVocabulary(products: Product[]): string[] {
  const words = new Set<string>(Object.keys(SYNONYMS));
  for (const product of products) {
    for (const token of tokenize(
      `${product.name} ${product.giTagName} ${product.originState} ${product.shortDescription}`,
    )) {
      if (token.length >= 4) words.add(token);
    }
  }
  return [...words];
}

/**
 * The correction offered when a search finds nothing. Only fires on a real
 * near-miss — one edit for short words, two for long ones — because
 * suggesting an unrelated word reads as the site not listening.
 */
export function suggestCorrection(
  products: Product[],
  raw: string,
): string | null {
  const { typed } = expandQuery(raw);
  if (typed.length === 0) return null;

  const vocabulary = buildVocabulary(products);
  let changed = false;

  const corrected = typed.map((token) => {
    if (token.length < 4) return token;
    const max = token.length > 6 ? 2 : 1;

    let bestWord = token;
    let bestDistance = max + 1;
    for (const word of vocabulary) {
      const distance = editDistance(token, word, max);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestWord = word;
      }
      if (bestDistance === 1) break;
    }

    if (bestDistance <= max && bestWord !== token) {
      changed = true;
      return bestWord;
    }
    return token;
  });

  return changed ? corrected.join(" ") : null;
}
