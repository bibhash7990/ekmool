/**
 * Typed index of the MDX posts under src/app/blog/<slug>/page.mdx.
 * Kept in code (rather than filesystem globbing) so the listing page,
 * sitemap and Article JSON-LD all read from one source at build time.
 */

export interface BlogPost {
  slug: string;
  title: string;
  /** ≤60 chars for the <title>. */
  titleTag: string;
  /** 150–160 chars. */
  description: string;
  /** ISO date. */
  publishedAt: string;
  readingMinutes: number;
  /** Short standfirst shown on the listing page. */
  excerpt: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "lakadong-vs-kandhamal-turmeric",
    title: "Lakadong vs Kandhamal Turmeric: Which Should You Buy?",
    titleTag: "Lakadong vs Kandhamal Turmeric: Which to Buy",
    description:
      "Lakadong vs Kandhamal turmeric compared on curcumin, flavour, colour, price and best use. A practical guide to choosing between India's two best-known GI turmerics.",
    publishedAt: "2026-07-14",
    readingMinutes: 8,
    excerpt:
      "One has three times the curcumin. The other is organic by inheritance and costs half as much. They are not competing for the same job — here is how to tell which belongs in your kitchen.",
  },
  {
    slug: "what-is-a-gi-tag",
    title: "What Is a GI Tag, and Why Does It Matter for What You Eat?",
    titleTag: "What Is a GI Tag and Why It Matters",
    description:
      "What a Geographical Indication actually guarantees about Indian food, what it does not, and how to read a GI claim on a spice pack without being misled by it.",
    publishedAt: "2026-07-02",
    readingMinutes: 9,
    excerpt:
      "A GI tag is a legal fact about geography, not a quality medal. Understanding the difference is the single most useful thing you can learn before buying Indian spices online.",
  },
  {
    slug: "makhana-benefits",
    title: "Makhana: India's Best Healthy Snack, Explained",
    titleTag: "Makhana Benefits: India's Best Healthy Snack",
    description:
      "What makhana is, how fox nuts are farmed and hand-popped in Bihar, what the nutrition actually says, and six ways to cook them beyond the usual roasted handful.",
    publishedAt: "2026-06-20",
    readingMinutes: 7,
    excerpt:
      "Harvested by divers from pond beds and popped one seed at a time by hand. The most labour-intensive snack in India is also the lightest — here is the whole story.",
  },
];

export function getBlogPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}
