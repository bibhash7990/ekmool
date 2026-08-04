import type { Metadata } from "next";
import Link from "next/link";

import { BLOG_POSTS } from "@/lib/blog-registry";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "The Journal — Sourcing, GI Tags & Indian Spice",
  description:
    "Field notes on GI-tagged Indian food: how Lakadong and Kandhamal turmeric differ, what a Geographical Indication really guarantees, and how makhana is farmed.",
  alternates: { canonical: "/blog" },
  openGraph: {
    url: "/blog",
    title: "The Ekmool Journal | Ekmool",
    description:
      "Field notes on GI-tagged Indian food — sourcing, origin and what the labels actually mean.",
  },
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function BlogPage() {
  const posts = [...BLOG_POSTS].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ href: "/blog", label: "Journal" }]} />

      <header className="mt-10 max-w-2xl">
        <Eyebrow>Field notes</Eyebrow>
        <h1 className="mt-5 font-display text-46 text-ek-green-900 lg:text-64">
          The Journal
        </h1>
        <p className="mt-6 text-20 text-ek-green-700">
          What we learn buying directly from five GI districts — written for
          people who want to know what they are actually cooking with.
        </p>
      </header>

      <SoilLine align="left" className="my-12 max-w-sm" />

      <ul className="grid gap-x-10 gap-y-14 lg:grid-cols-3">
        {posts.map((post, i) => (
          <Reveal as="li" key={post.slug} index={i}>
            <article>
              <Eyebrow>
                <time dateTime={post.publishedAt}>
                  {DATE_FORMAT.format(new Date(post.publishedAt))}
                </time>
                {" · "}
                {post.readingMinutes} min
              </Eyebrow>
              <h2 className="mt-4 font-display text-26 text-ek-green-900">
                <Link
                  href={`/blog/${post.slug}`}
                  className="transition-colors hover:text-ek-gold-800"
                >
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 text-15 text-ek-green-700">{post.excerpt}</p>
              <Link
                href={`/blog/${post.slug}`}
                className="link-draw mt-4 inline-block text-15 text-ek-gold-800"
                aria-label={`Read: ${post.title}`}
              >
                Read the piece
              </Link>
            </article>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}
