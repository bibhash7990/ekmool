/**
 * Catalog seed — commerce data for the 5 GI products and their 15 variants.
 *
 * Split of responsibilities:
 *   this file           → what the DB stores (names, descriptions, prices,
 *                         stock, image alt text)
 *   src/content/products.ts → page-level editorial + SEO copy (title tags,
 *                         meta descriptions, H1s, FAQs, keyword clusters)
 *
 * Copy rules: FSSAI-safe throughout — "rich in", "traditionally used",
 * never "cures", "treats", "prevents", or any disease claim.
 * Prices are integer paise.
 */

export interface SeedVariant {
  sku: string;
  packSizeLabel: string;
  packSizeGrams: number;
  pricePaise: number;
  mrpPaise: number;
  stockQty: number;
  lowStockThreshold: number;
}

export interface SeedImage {
  url: string;
  altText: string;
  isPrimary: boolean;
}

export interface SeedProduct {
  slug: string;
  name: string;
  originState: string;
  giTagName: string;
  accent: "gold" | "terracotta" | "green";
  shortDescription: string;
  longDescription: string;
  variants: SeedVariant[];
  images: SeedImage[];
}

export const SEED_PRODUCTS: SeedProduct[] = [
  /* ------------------------------------------------------------------ */
  {
    slug: "kandhamal-turmeric-powder",
    name: "Kandhamal Turmeric Powder",
    originState: "Odisha",
    giTagName: "Kandhamal Haladi (GI)",
    accent: "gold",
    shortDescription:
      "Organically grown GI turmeric from the Kandhamal hills of Odisha, stone-dried and stone-ground. Naturally rich in curcumin at over 3%.",
    longDescription: `Kandhamal Haladi is not a brand name. It is a district in the highlands of Odisha, and it is one of a small handful of Indian turmerics to carry a Geographical Indication in its own right. The tag was granted because what grows there cannot be reproduced elsewhere: laterite soil, a monsoon that arrives on time, elevations between 300 and 1,100 metres, and a farming tradition that predates any certification body.

The turmeric is grown almost entirely by the Kondh community, who have cultivated these hillsides for generations on plots that rarely exceed an acre. Nothing synthetic goes into the ground. There is no chemical fertiliser and no pesticide, not because a standard demands it but because the practice never included them — the fields are fed with cattle manure and forest leaf litter, and the crop is rotated with pulses and millets in the same way it has been for as long as anyone in the village can remember. That makes Kandhamal turmeric organic by inheritance rather than by conversion.

Rhizomes are lifted between January and March, boiled, then dried in the open sun on stone for ten to fifteen days until they rattle. Sun-drying at this pace matters. Mechanical hot-air drying is faster and cheaper, and it strips out the volatile oils that carry aroma. What survives the slower method is a turmeric that smells of earth and warm pepper before it ever touches a pan.

The powder is naturally rich in curcumin — above three per cent, comfortably beyond the one-to-two per cent typical of commodity turmeric sold by weight. Colour is a deep saffron-orange rather than the flat chrome yellow of blended, colour-corrected powders.

We buy directly from farmer collectives in Kandhamal, mill in small batches to order, and pack within days of grinding. There is no filler, no colour, no anti-caking agent, and no rice starch — only turmeric. Use it as you would any turmeric: in dal, in a marinade, in haldi doodh at the end of a long day.`,
    variants: [
      {
        sku: "EK-KAN-100",
        packSizeLabel: "100 g",
        packSizeGrams: 100,
        pricePaise: 18900,
        mrpPaise: 22500,
        stockQty: 180,
        lowStockThreshold: 20,
      },
      {
        sku: "EK-KAN-250",
        packSizeLabel: "250 g",
        packSizeGrams: 250,
        pricePaise: 42900,
        mrpPaise: 52000,
        stockQty: 140,
        lowStockThreshold: 20,
      },
      {
        sku: "EK-KAN-500",
        packSizeLabel: "500 g",
        packSizeGrams: 500,
        pricePaise: 79900,
        mrpPaise: 98000,
        stockQty: 90,
        lowStockThreshold: 15,
      },
    ],
    images: [
      {
        url: "/images/products/kandhamal-turmeric-pack.jpg",
        altText:
          "Ekmool Kandhamal turmeric powder in a kraft pouch with the green seal label, standing on a jute mat",
        isPrimary: true,
      },
      {
        url: "/images/products/kandhamal-turmeric-loose.jpg",
        altText:
          "Deep saffron-orange Kandhamal turmeric powder mounded in a brass bowl, overhead view",
        isPrimary: false,
      },
      {
        url: "/images/products/kandhamal-turmeric-rhizome.jpg",
        altText:
          "Whole dried Kandhamal turmeric rhizomes beside ground powder on weathered wood",
        isPrimary: false,
      },
      {
        url: "/images/products/kandhamal-turmeric-in-use.jpg",
        altText:
          "A spoonful of Kandhamal turmeric powder being stirred into simmering dal in a steel pan",
        isPrimary: false,
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "lakadong-turmeric-powder",
    name: "Lakadong Turmeric Powder",
    originState: "Meghalaya",
    giTagName: "Lakadong Turmeric (GI)",
    accent: "gold",
    shortDescription:
      "The highest-curcumin turmeric grown in India — 7 to 12% — from the Lakadong villages of the Jaintia Hills, Meghalaya. Sun-dried, small-batch milled.",
    longDescription: `Lakadong is a cluster of villages in the Jaintia Hills of Meghalaya, and the turmeric named after it is the reason curcumin percentages ever entered an Indian shopping conversation. Where commodity turmeric sits between one and three per cent curcumin, Lakadong ranges from seven to twelve. Nothing is added to achieve that. It is a landrace cultivar that has adapted to one specific set of conditions over centuries.

Those conditions are unusually particular. The fields sit between 1,000 and 1,400 metres on steep slopes, in acidic soil with high organic matter, under one of the wettest climates on earth. The crop takes a full nine to ten months to mature — considerably longer than turmeric grown on the plains — and that extended season is where the curcumin accumulates. Attempts to move the cultivar to lower altitudes produce a plant that looks the same and tests far weaker. The place is not incidental; it is the whole explanation.

Cultivation is done by Khasi and Pnar farming families on terraced plots, using jhum-derived rotation and organic inputs. Harvest runs from December through February. The rhizomes are boiled, sliced, and sun-dried on bamboo racks — a slower process than machine drying, and one that preserves the volatile oils responsible for Lakadong's distinctive aroma: sharper and more resinous than plains turmeric, with a bitterness at the back that tells you the curcumin is genuinely there.

The colour is unmistakable. Lakadong powder is a deep burnt orange, closer to paprika than to the pale yellow most Indian kitchens know. A quarter teaspoon does the work of a full one.

We source through farmer producer organisations in the Jaintia Hills that pay at declared rates, and we mill in small batches so the powder reaches you within weeks of grinding rather than months. It is traditionally used in golden milk, in slow-cooked curries, and stirred into warm water with black pepper and a little fat, which is how the region has taken it for generations.`,
    variants: [
      {
        sku: "EK-LAK-100",
        packSizeLabel: "100 g",
        packSizeGrams: 100,
        pricePaise: 27900,
        mrpPaise: 34000,
        stockQty: 160,
        lowStockThreshold: 20,
      },
      {
        sku: "EK-LAK-250",
        packSizeLabel: "250 g",
        packSizeGrams: 250,
        pricePaise: 62900,
        mrpPaise: 78000,
        stockQty: 110,
        lowStockThreshold: 20,
      },
      {
        sku: "EK-LAK-500",
        packSizeLabel: "500 g",
        packSizeGrams: 500,
        pricePaise: 118900,
        mrpPaise: 148000,
        stockQty: 60,
        lowStockThreshold: 12,
      },
    ],
    images: [
      {
        url: "/images/products/lakadong-turmeric-pack.jpg",
        altText:
          "Ekmool Lakadong turmeric powder pouch with the Meghalaya origin label, on dark slate",
        isPrimary: true,
      },
      {
        url: "/images/products/lakadong-turmeric-loose.jpg",
        altText:
          "Burnt-orange Lakadong turmeric powder in a shallow bowl, showing its deep colour against paper",
        isPrimary: false,
      },
      {
        url: "/images/products/lakadong-turmeric-comparison.jpg",
        altText:
          "Lakadong turmeric powder beside ordinary turmeric, showing the darker orange of the high-curcumin variety",
        isPrimary: false,
      },
      {
        url: "/images/products/lakadong-turmeric-golden-milk.jpg",
        altText:
          "Golden milk made with Lakadong turmeric in a ceramic cup on a linen cloth",
        isPrimary: false,
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "mithila-makhana",
    name: "Mithila Makhana (Fox Nuts)",
    originState: "Bihar",
    giTagName: "Mithila Makhana (GI)",
    accent: "green",
    shortDescription:
      "GI-tagged phool makhana from the pond belt of Mithila, Bihar. Hand-popped, large-grade, unroasted and unsalted — a light snack that is naturally low in fat.",
    longDescription: `Makhana comes out of standing water, which is the first thing most people who eat it do not know. The plant is Euryale ferox, a spiny aquatic relative of the water lily, and it has been farmed in the shallow ponds of north Bihar's Mithila region for centuries. In 2022 the crop received a Geographical Indication under the name Mithila Makhana, formalising what the region's markets had recognised for far longer.

The work is difficult and almost entirely manual. Seeds settle into the pond bed beneath a canopy of thorned leaves, and divers from the Mallah community harvest them by hand, feeling through mud in chest-deep water across repeated passes over several weeks. The seeds are then washed, graded, sun-dried, tempered, and roasted in shallow iron pans — after which each one is struck at exactly the right moment with a wooden mallet so the black shell fractures and the white kernel bursts free. It is done one seed at a time. A skilled popper works through thousands in a day, and the timing cannot be automated: too early and the kernel stays inside, too late and it scorches.

What emerges is phool makhana, the "flower" grade — light, chalk-white, and hollow-sounding. We buy large-grade pops only, which command a premium in Bihar's own mandis because size correlates with a clean burst and an even crunch.

Ours arrive plain: no oil, no salt, no seasoning, no roasting beyond what the popping required. Makhana is naturally low in fat and rich in plant protein, and it has been traditionally used in Indian households as a light evening snack, in kheer, and in temple offerings during fasting periods.

Toss them in a dry pan with ghee and a pinch of salt for five minutes and they crisp beautifully. Or simmer them in milk with cardamom until they swell. They keep for months in an airtight jar, provided you can leave them alone that long.`,
    variants: [
      {
        sku: "EK-MAK-100",
        packSizeLabel: "100 g",
        packSizeGrams: 100,
        pricePaise: 22900,
        mrpPaise: 28000,
        stockQty: 200,
        lowStockThreshold: 25,
      },
      {
        sku: "EK-MAK-250",
        packSizeLabel: "250 g",
        packSizeGrams: 250,
        pricePaise: 52900,
        mrpPaise: 65000,
        stockQty: 150,
        lowStockThreshold: 20,
      },
      {
        sku: "EK-MAK-500",
        packSizeLabel: "500 g",
        packSizeGrams: 500,
        pricePaise: 99900,
        mrpPaise: 124000,
        stockQty: 80,
        lowStockThreshold: 15,
      },
    ],
    images: [
      {
        url: "/images/products/mithila-makhana-pack.jpg",
        altText:
          "Ekmool Mithila makhana pouch with the Bihar origin label beside a scatter of fox nuts",
        isPrimary: true,
      },
      {
        url: "/images/products/mithila-makhana-bowl.jpg",
        altText:
          "Large-grade white phool makhana heaped in a brass bowl on jute, overhead",
        isPrimary: false,
      },
      {
        url: "/images/products/mithila-makhana-roasted.jpg",
        altText:
          "Makhana being pan-roasted in ghee with salt in a cast-iron skillet",
        isPrimary: false,
      },
      {
        url: "/images/products/mithila-makhana-pond.jpg",
        altText:
          "A Mithila makhana pond in Bihar with the spiny leaves of the Euryale ferox plant on the surface",
        isPrimary: false,
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "guntur-chilli-powder",
    name: "Guntur Chilli Powder",
    originState: "Andhra Pradesh",
    giTagName: "Guntur Sannam Chilli (GI)",
    accent: "terracotta",
    shortDescription:
      "Guntur Sannam S4 — the GI chilli that defines Andhra heat. Stem-removed, sun-dried and ground whole, with nothing blended in to soften it.",
    longDescription: `Guntur in Andhra Pradesh runs the largest chilli market in Asia, and the variety that made its name is Sannam S4 — a slim, deep-red pod with a Scoville range of roughly 35,000 to 40,000 units. Its Geographical Indication covers the Guntur belt specifically, because the combination of black cotton soil, a long dry ripening window, and post-harvest practice produces a heat and a colour that the same seed does not deliver elsewhere.

Sannam is a working chilli, not a novelty. It is the heat behind Andhra pappu, behind gongura pachadi, behind the pickles that arrive at the table in small quantities for good reason. What distinguishes it from generic "red chilli powder" is that the heat is clean and immediate rather than dull and lingering — it announces itself at the front of the palate and then recedes, leaving the other spices in a dish still legible.

Harvest runs from January into March. Pods are picked ripe, then spread in single layers on drying yards for a week or more, turned by hand, until the moisture drops low enough for long storage. Sun-drying holds the colour; kiln-drying tends to dull it. The dried pods are then de-stemmed before grinding, which matters more than it sounds: stems add bulk and no flavour, and their absence is one of the clearest markers of a powder that has not been padded.

We grind whole pods with seeds intact, in small batches, and pack immediately. Nothing is blended in — no bran, no salt, no synthetic colour, no husk from a cheaper variety. Because we do not colour-correct, the shade varies a little between lots, which is what unadulterated chilli actually does across a season.

Treat it as a heat source rather than a colouring agent. If you want deep red without the burn, our Byadagi is the chilli for that, and many Indian kitchens keep both — a spoon of Guntur for heat, a spoon of Byadagi for colour.`,
    variants: [
      {
        sku: "EK-GUN-100",
        packSizeLabel: "100 g",
        packSizeGrams: 100,
        pricePaise: 14900,
        mrpPaise: 18000,
        stockQty: 190,
        lowStockThreshold: 25,
      },
      {
        sku: "EK-GUN-250",
        packSizeLabel: "250 g",
        packSizeGrams: 250,
        pricePaise: 32900,
        mrpPaise: 41000,
        stockQty: 145,
        lowStockThreshold: 20,
      },
      {
        sku: "EK-GUN-500",
        packSizeLabel: "500 g",
        packSizeGrams: 500,
        pricePaise: 59900,
        mrpPaise: 76000,
        stockQty: 85,
        lowStockThreshold: 15,
      },
    ],
    images: [
      {
        url: "/images/products/guntur-chilli-pack.jpg",
        altText:
          "Ekmool Guntur chilli powder pouch with the Andhra Pradesh origin label on a dark surface",
        isPrimary: true,
      },
      {
        url: "/images/products/guntur-chilli-loose.jpg",
        altText:
          "Bright red Guntur Sannam chilli powder in a stone bowl, overhead with hard side light",
        isPrimary: false,
      },
      {
        url: "/images/products/guntur-chilli-pods.jpg",
        altText:
          "Whole dried Guntur Sannam S4 chilli pods with stems removed, arranged on jute",
        isPrimary: false,
      },
      {
        url: "/images/products/guntur-chilli-in-use.jpg",
        altText:
          "Guntur chilli powder being spooned into a tempering pan of hot oil and curry leaves",
        isPrimary: false,
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "byadagi-chilli-powder",
    name: "Byadagi Chilli Powder",
    originState: "Karnataka",
    giTagName: "Byadagi Chilli (GI)",
    accent: "terracotta",
    shortDescription:
      "The GI chilli prized for deep red colour with mild heat — Karnataka's Byadagi, ground whole. The honest substitute where a recipe asks for Kashmiri chilli.",
    longDescription: `Byadagi is a town in the Haveri district of Karnataka, and the wrinkled crimson chilli named after it is grown for one quality above all others: colour. Its heat sits low, roughly 8,000 to 15,000 Scoville units, but its natural pigment content is high enough that Byadagi is extracted commercially for oleoresin used worldwide as a food colourant. In an Indian kitchen that translates into a simple, useful fact — you can use a great deal of it and the dish turns a deep, glowing red without becoming hot.

The pods are long, slender, and heavily creased, which is where the local name Byadagi Kaddi comes from. They ripen on the plant into late season and are sun-dried whole across January and February; the wrinkling develops during drying and is the visual marker buyers look for. The GI is tied to the Byadagi belt because soil and climate there produce a pigment concentration the same cultivar does not reach when planted elsewhere.

It is the backbone of Karnataka cooking — bisi bele bath, the dry chutney powders, sambar masala — and it does the same job in Maharashtrian and Konkani kitchens. Most usefully for anyone shopping online: where a recipe calls for Kashmiri chilli powder for colour, Byadagi is the closest honest substitute, and a good deal of what is sold as Kashmiri in Indian retail is in fact Byadagi. We would rather name it correctly than trade on the other region's reputation.

We grind whole sun-dried pods, seeds included, in small batches, with no synthetic colour, no husk filler and no blending with hotter varieties to bulk out the weight. Because the colour is entirely natural it will shift slightly from lot to lot across a season — an unblended chilli always does.

Keep it beside a hotter chilli rather than instead of one. Byadagi for colour and body, Guntur for heat, adjusted to taste: that pairing is how most South Indian kitchens have handled the problem for generations.`,
    variants: [
      {
        sku: "EK-BYA-100",
        packSizeLabel: "100 g",
        packSizeGrams: 100,
        pricePaise: 15900,
        mrpPaise: 19500,
        stockQty: 175,
        lowStockThreshold: 25,
      },
      {
        sku: "EK-BYA-250",
        packSizeLabel: "250 g",
        packSizeGrams: 250,
        pricePaise: 35900,
        mrpPaise: 44000,
        stockQty: 130,
        lowStockThreshold: 20,
      },
      {
        sku: "EK-BYA-500",
        packSizeLabel: "500 g",
        packSizeGrams: 500,
        pricePaise: 66900,
        mrpPaise: 84000,
        stockQty: 75,
        lowStockThreshold: 15,
      },
    ],
    images: [
      {
        url: "/images/products/byadagi-chilli-pack.jpg",
        altText:
          "Ekmool Byadagi chilli powder pouch with the Karnataka origin label beside wrinkled dried pods",
        isPrimary: true,
      },
      {
        url: "/images/products/byadagi-chilli-loose.jpg",
        altText:
          "Deep red Byadagi chilli powder in a shallow dish showing its rich natural colour",
        isPrimary: false,
      },
      {
        url: "/images/products/byadagi-chilli-pods.jpg",
        altText:
          "Long wrinkled Byadagi Kaddi chilli pods laid in a row on weathered wood",
        isPrimary: false,
      },
      {
        url: "/images/products/byadagi-chilli-in-use.jpg",
        altText:
          "Byadagi chilli powder stirred into a simmering red curry, showing deep colour without heat haze",
        isPrimary: false,
      },
    ],
  },
];
