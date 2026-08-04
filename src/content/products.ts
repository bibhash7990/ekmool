/**
 * Page-level editorial + SEO copy, keyed by product slug.
 *
 * Lives in the repo rather than the database because it is content, not
 * commerce: it changes on an editorial cadence, belongs in version control,
 * and is needed at build time for SSG without a database round trip.
 * Commerce data (prices, stock, descriptions) comes from the DB.
 *
 * Title tags ≤ 60 characters; meta descriptions 150–160 characters.
 * All copy is FSSAI-safe: no disease, cure, or treatment claims.
 */

export interface ProductFaq {
  question: string;
  answer: string;
}

export interface ProductContent {
  /** ≤60 chars — the "%s" in the "%s | Ekmool" template. */
  titleTag: string;
  /** 150–160 chars. */
  metaDescription: string;
  /** The single visible <h1>. May differ from the catalogue name. */
  h1: string;
  /** One-line positioning shown under the H1. */
  tagline: string;
  /** Primary keyword cluster — informs copy, never stuffed into markup. */
  keywords: string[];
  /** Visible Q&A — the ONLY source for FAQPage structured data. */
  faq: ProductFaq[];
  /** Art direction for the hero photograph, shown in the placeholder. */
  heroArtDirection: string;
  /** Practical usage note rendered beside the description. */
  useNote: string;
  /** Short, factual spec rows. */
  specs: { label: string; value: string }[];
}

export const PRODUCT_CONTENT: Record<string, ProductContent> = {
  /* ------------------------------------------------------------------ */
  "kandhamal-turmeric-powder": {
    titleTag: "Buy Kandhamal Turmeric Powder Online — GI, Organic",
    metaDescription:
      "Buy Kandhamal turmeric online: GI-tagged organic turmeric powder from Odisha, over 3% curcumin, stone-dried and small-batch milled. Free shipping over ₹499.",
    h1: "Kandhamal Turmeric Powder",
    tagline:
      "GI-tagged organic turmeric from the Kandhamal hills of Odisha · curcumin above 3%",
    keywords: [
      "buy kandhamal turmeric online",
      "GI tag turmeric Odisha",
      "organic turmeric powder India",
      "high curcumin turmeric",
    ],
    heroArtDirection:
      "Overhead: Kandhamal turmeric mounded on raw jute beside a brass measuring spoon, one whole dried rhizome at the frame edge. Hard warm side light from the left, deep shadow, no imported props.",
    useNote:
      "A rounded half-teaspoon is enough for a pot of dal for four. Add it early, with the aromatics, so the raw edge cooks off in the fat.",
    specs: [
      { label: "Origin", value: "Kandhamal district, Odisha" },
      { label: "GI registration", value: "Kandhamal Haladi" },
      { label: "Curcumin", value: "Above 3%" },
      { label: "Cultivation", value: "Organic by tradition — no synthetic inputs" },
      { label: "Processing", value: "Boiled, sun-dried on stone, small-batch ground" },
      { label: "Ingredients", value: "100% turmeric. No filler, colour or anti-caking agent." },
    ],
    faq: [
      {
        question: "What does the GI tag on Kandhamal turmeric actually guarantee?",
        answer:
          "It guarantees origin, not grade. A Geographical Indication is a legal registration that reserves the name 'Kandhamal Haladi' for turmeric actually grown in the Kandhamal district of Odisha, under the practices documented in the GI application. It tells you where the crop came from and that the traditional method was followed. It does not by itself certify a curcumin percentage, which is why we state ours separately.",
      },
      {
        question: "Is Kandhamal turmeric organic, and is it certified?",
        answer:
          "It is grown without synthetic fertiliser or pesticide — the Kondh farmers who cultivate it have never used them, feeding the soil with cattle manure and forest leaf litter instead. That makes it organic in practice by long tradition. Formal organic certification is held at the collective level for some lots and not others, so we describe the cultivation method honestly rather than putting a certification claim on every pack.",
      },
      {
        question: "How is this different from Lakadong turmeric?",
        answer:
          "Curcumin content and character. Kandhamal sits above 3%, Lakadong between 7% and 12%. Kandhamal is rounder and earthier and behaves like a everyday cooking turmeric; Lakadong is sharper, more resinous, and strong enough that you use noticeably less. Many customers keep Kandhamal for daily cooking and Lakadong for golden milk and tonics.",
      },
      {
        question: "How should I store turmeric powder, and how long does it keep?",
        answer:
          "Keep it in an airtight container away from light, heat and the steam of a stovetop — a closed cupboard rather than a shelf above the hob. Ground turmeric stays good for about twelve months, but aroma is at its peak in the first three to four. We mill in small batches and pack within days of grinding for exactly that reason.",
      },
      {
        question: "Why does the colour vary slightly between orders?",
        answer:
          "Because nothing is added to standardise it. Turmeric colour shifts with harvest lot, rainfall in that season, and how long the rhizomes dried in the sun. Powders that look identical every single time have usually been colour-corrected. Ours will vary a little across the year, and that variation is the honest signal.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  "lakadong-turmeric-powder": {
    titleTag: "Lakadong Turmeric Buy Online — 7–12% Curcumin, GI",
    metaDescription:
      "Lakadong turmeric buy online: the highest curcumin turmeric in India at 7–12%, GI-tagged from Meghalaya's Jaintia Hills. Sun-dried, small-batch, shipped fresh.",
    h1: "Lakadong Turmeric Powder",
    tagline:
      "The highest-curcumin turmeric grown in India · Jaintia Hills, Meghalaya · 7–12%",
    keywords: [
      "lakadong turmeric buy online",
      "highest curcumin turmeric in India",
      "Meghalaya turmeric powder",
      "lakadong haldi price",
    ],
    heroArtDirection:
      "Overhead on dark slate: Lakadong powder in a shallow stone dish, its burnt-orange depth against the grey. A second smaller dish of ordinary pale turmeric just inside the frame for contrast. Single hard light source, raking from the right.",
    useNote:
      "Use roughly half what a recipe asks for. In golden milk, a quarter teaspoon with a crack of black pepper and a little ghee is the traditional preparation.",
    specs: [
      { label: "Origin", value: "Lakadong villages, Jaintia Hills, Meghalaya" },
      { label: "GI registration", value: "Lakadong Turmeric" },
      { label: "Curcumin", value: "7–12%" },
      { label: "Altitude", value: "1,000–1,400 m" },
      { label: "Processing", value: "Boiled, sliced, sun-dried on bamboo racks" },
      { label: "Ingredients", value: "100% Lakadong turmeric. Nothing added." },
    ],
    faq: [
      {
        question: "Why is Lakadong turmeric so much higher in curcumin?",
        answer:
          "It is a landrace cultivar adapted to one specific place. The Lakadong plant grows at 1,000 to 1,400 metres in acidic, organic-rich soil under very heavy rainfall, and it takes nine to ten months to mature — considerably longer than turmeric grown on the plains. That extended season is when curcumin accumulates. The same seed planted at low altitude produces a plant that looks identical and tests far weaker.",
      },
      {
        question: "How much Lakadong should I use compared to regular turmeric?",
        answer:
          "About half. Because the curcumin content is three to five times that of commodity turmeric, and the flavour is correspondingly sharper and more resinous, a recipe calling for one teaspoon of ordinary turmeric is usually well served by half a teaspoon of Lakadong. Start lower than you think and adjust — the bitterness at the back of the palate is the curcumin, and it is easy to overshoot.",
      },
      {
        question: "Is the curcumin percentage tested, or is it an estimate?",
        answer:
          "Lakadong's 7–12% range is the documented range for the cultivar grown in its GI area, and lots are tested at the producer-organisation level before we buy. Any individual pack sits somewhere inside that band depending on harvest and season. We publish the range rather than a single flattering number, because a fixed figure printed year-round would not be honest about how an agricultural product actually varies.",
      },
      {
        question: "Why is Lakadong more expensive than other turmeric?",
        answer:
          "Small terraced plots on steep hill slopes, a growing season three months longer than plains turmeric, manual harvest, and sun-drying on bamboo racks rather than machine drying. Yields per acre are lower and the labour per kilo is higher. We buy through farmer producer organisations at declared rates rather than through intermediaries, which is a meaningful part of the price and the part we are least willing to compress.",
      },
      {
        question: "Can I take Lakadong turmeric in warm water or milk?",
        answer:
          "Yes — it is traditionally used exactly that way across Meghalaya and much of India, stirred into warm milk or water with black pepper and a little fat. We are a food company, not a medical one, so we will describe the tradition and the composition and leave health advice to your doctor, particularly if you are pregnant, on blood thinners, or taking it in large or concentrated amounts.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  "mithila-makhana": {
    titleTag: "Buy Makhana Online — Mithila GI Phool Makhana",
    metaDescription:
      "Buy makhana online: GI-tagged Mithila phool makhana from Bihar, large-grade and hand-popped. Plain, unsalted, naturally low in fat. Check phool makhana price.",
    h1: "Mithila Makhana",
    tagline:
      "GI-tagged phool makhana from the pond belt of Bihar · hand-popped, large grade",
    keywords: [
      "buy makhana online",
      "mithila makhana GI",
      "phool makhana price",
      "healthy roasted snacks India",
    ],
    heroArtDirection:
      "Overhead: large-grade white makhana heaped in a shallow brass bowl on jute, a few pops scattered outside the bowl to show scale and irregularity. Soft warm window light from the left, gentle shadow — this product needs light, not drama.",
    useNote:
      "Dry-roast in a pan with a teaspoon of ghee and salt for five minutes until they squeak. Or simmer in milk with cardamom for kheer.",
    specs: [
      { label: "Origin", value: "Mithila region, north Bihar" },
      { label: "GI registration", value: "Mithila Makhana" },
      { label: "Grade", value: "Large (phool) grade only" },
      { label: "Processing", value: "Hand-harvested, sun-dried, hand-popped" },
      { label: "Seasoning", value: "None — plain, unsalted, unroasted" },
      { label: "Ingredients", value: "100% fox nuts (Euryale ferox)." },
    ],
    faq: [
      {
        question: "What exactly is makhana, and where does it grow?",
        answer:
          "Makhana is the popped seed of Euryale ferox, a spiny aquatic plant related to the water lily. It grows in standing water — the shallow ponds of north Bihar's Mithila region, where it has been farmed for centuries. Seeds are harvested by hand from the pond bed, sun-dried, roasted in iron pans, then struck individually with a wooden mallet so the shell fractures and the white kernel bursts out.",
      },
      {
        question: "What does 'phool makhana' mean, and is bigger better?",
        answer:
          "Phool means flower, and phool makhana is the large, fully-burst grade — the pops that opened cleanly and evenly. Size does correlate with quality here: a large pop indicates the seed was mature and struck at the right moment, and it gives a lighter, more even crunch. Bihar's own mandis price by grade for this reason, and we buy large grade only.",
      },
      {
        question: "Is makhana a healthy snack?",
        answer:
          "It is naturally low in fat and a source of plant protein, and because ours arrives plain — no oil, no salt, no seasoning — what you add is entirely up to you. Indian households have traditionally used it as a light evening snack, in kheer, and during fasting periods. We will not go further than that: we sell food, and specific health outcomes are a conversation for you and a dietitian.",
      },
      {
        question: "Why is good makhana expensive?",
        answer:
          "Because almost every step is manual and cannot be mechanised. Divers from the Mallah community harvest seeds by feel from chest-deep mud over repeated passes across several weeks. Popping is done one seed at a time, by hand, with a timing window measured in seconds. A skilled worker gets through thousands a day, and that labour — not packaging or branding — is most of what you are paying for.",
      },
      {
        question: "How do I store makhana and keep it crisp?",
        answer:
          "Airtight, at room temperature, away from humidity — a glass jar with a good seal is ideal. Stored that way it keeps for several months. If it ever goes slightly soft during a humid stretch, three or four minutes in a dry pan over low heat brings the crunch straight back; you do not need to throw it out.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  "guntur-chilli-powder": {
    titleTag: "Guntur Chilli Powder Online — GI Sannam, Hot",
    metaDescription:
      "Guntur chilli powder online: GI-tagged Sannam S4 from Andhra Pradesh, 35,000–40,000 SHU. Andhra lal mirch powder ground whole, de-stemmed, no filler or colour.",
    h1: "Guntur Chilli Powder",
    tagline:
      "GI Sannam S4 from Andhra Pradesh · clean, immediate heat at 35,000–40,000 SHU",
    keywords: [
      "guntur chilli powder online",
      "sannam chilli",
      "Andhra lal mirch powder",
      "hot red chilli powder India",
    ],
    heroArtDirection:
      "Overhead on dark stone: Guntur powder in a rough stone bowl, a handful of whole de-stemmed Sannam pods fanned beside it. Hard raking light to catch the pod creases; the red should read hot, not decorative.",
    useNote:
      "Add to hot oil in the tempering, off the heat for a second so it blooms without burning. Start with half what you would use of a generic chilli powder.",
    specs: [
      { label: "Origin", value: "Guntur belt, Andhra Pradesh" },
      { label: "GI registration", value: "Guntur Sannam Chilli" },
      { label: "Variety", value: "Sannam S4" },
      { label: "Heat", value: "≈35,000–40,000 SHU" },
      { label: "Processing", value: "Sun-dried, de-stemmed, ground whole with seeds" },
      { label: "Ingredients", value: "100% chilli. No husk, salt or synthetic colour." },
    ],
    faq: [
      {
        question: "How hot is Guntur Sannam chilli powder?",
        answer:
          "Roughly 35,000 to 40,000 Scoville heat units, which places it firmly in the hot band for an everyday cooking chilli — well above Byadagi or Kashmiri, well below a bird's eye or ghost chilli. The character matters as much as the number: Sannam heat is clean and immediate at the front of the palate and then recedes, which is why it does not flatten the other spices in a dish.",
      },
      {
        question: "What does 'de-stemmed' mean and why does it matter?",
        answer:
          "The stems are removed from the dried pods before grinding. It matters because stems add weight and bulk but no flavour or heat, so grinding them in is a quiet way to pad a powder. Stem-free grinding is one of the clearest markers that a chilli powder has not been stretched, and it is standard practice for the better Guntur lots.",
      },
      {
        question: "Should I buy Guntur or Byadagi chilli powder?",
        answer:
          "They do different jobs. Guntur is for heat — it will make a dish hot and will not deepen its colour much. Byadagi is for colour — it turns a dish a rich red at a fraction of the heat. Most South Indian kitchens keep both and adjust the ratio per dish. If you are buying only one and you want heat, buy Guntur; if you want colour, buy Byadagi.",
      },
      {
        question: "Why is the shade of red not identical every time?",
        answer:
          "Because we do not colour-correct. Natural chilli colour varies with the harvest lot, how long the pods ripened on the plant, and the drying conditions that season. Powders that look exactly the same in every pack, every month, have usually been standardised with additives. A little variation across the year is what unadulterated chilli genuinely looks like.",
      },
      {
        question: "Are the seeds ground in with the pods?",
        answer:
          "Yes. We grind whole pods with seeds intact, which is traditional practice for Sannam and contributes to both the heat and the body of the powder. Some commercial mills separate seeds out and sell them on, then bulk the powder back up with husk. We would rather keep the chilli whole and sell you exactly what came off the drying yard.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  "byadagi-chilli-powder": {
    titleTag: "Byadagi Chilli Powder Online — GI, Mild & Deep Red",
    metaDescription:
      "Byadagi chilli powder online: GI-tagged Karnataka chilli for deep red colour with mild heat. The honest Kashmiri chilli substitute, ground whole, no filler.",
    h1: "Byadagi Chilli Powder",
    tagline:
      "GI chilli from Haveri, Karnataka · deep natural colour, mild heat at 8,000–15,000 SHU",
    keywords: [
      "byadagi chilli powder online",
      "mild chilli powder for colour",
      "kashmiri chilli substitute",
      "byadagi kaddi chilli",
    ],
    heroArtDirection:
      "Overhead: Byadagi powder in a shallow dish, its deep crimson glowing, with three long wrinkled Byadagi Kaddi pods laid diagonally alongside. Warm soft light from a large source — this chilli is about colour, so avoid harsh shadow across the powder.",
    useNote:
      "Use generously where a recipe wants colour — bisi bele bath, sambar powders, tandoori marinades. Pair with a hotter chilli if you also want heat.",
    specs: [
      { label: "Origin", value: "Byadagi belt, Haveri district, Karnataka" },
      { label: "GI registration", value: "Byadagi Chilli" },
      { label: "Variety", value: "Byadagi Kaddi" },
      { label: "Heat", value: "≈8,000–15,000 SHU (mild)" },
      { label: "Processing", value: "Sun-dried whole, ground with seeds" },
      { label: "Ingredients", value: "100% chilli. No synthetic colour or husk filler." },
    ],
    faq: [
      {
        question: "Can I use Byadagi instead of Kashmiri chilli powder?",
        answer:
          "Yes, and it is the closest honest substitute. Both are prized for deep red colour at low heat, and a large share of what is sold as 'Kashmiri chilli powder' in Indian retail is in fact Byadagi. We name it Byadagi because that is what it is. In a recipe calling for Kashmiri chilli for colour, use Byadagi one for one.",
      },
      {
        question: "How mild is Byadagi really?",
        answer:
          "Around 8,000 to 15,000 Scoville units, roughly a third of Guntur Sannam. In practice that means you can use a tablespoon in a dish for four and get a deep red colour with only gentle warmth. It is the chilli that lets you make something look fiery without it being fiery — which is precisely why Karnataka cooking leans on it so heavily.",
      },
      {
        question: "What are the wrinkles on the pods, and do they matter?",
        answer:
          "The deep creasing is characteristic of the Byadagi Kaddi variety and develops as the pods sun-dry, which is where the name kaddi (stick) comes from. Buyers use it as a visual marker of the genuine variety, since a smooth pod of similar colour is usually something else. It does not change how the powder behaves, but it is a useful authenticity check when buying whole pods.",
      },
      {
        question: "Why does Byadagi cost more than ordinary red chilli powder?",
        answer:
          "Because it is grown for pigment rather than yield, and it competes with industrial demand — Byadagi is extracted commercially for oleoresin used as a natural food colourant worldwide, which puts a floor under the price of good lots. We buy from within the GI belt rather than blending in cheaper look-alikes to bring the number down.",
      },
      {
        question: "Will Byadagi make my food hot at all?",
        answer:
          "Gently. There is real heat there, just far less of it, and it arrives as warmth rather than a burn. If you are cooking for children or for anyone who finds Indian food too hot, Byadagi lets you keep the colour and the chilli flavour while dropping most of the burn. Add a hotter chilli separately if you want the heat back on your own terms.",
      },
    ],
  },
};

export function getProductContent(slug: string): ProductContent | null {
  return PRODUCT_CONTENT[slug] ?? null;
}
