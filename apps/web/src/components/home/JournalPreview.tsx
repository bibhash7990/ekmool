import Link from "next/link";

import { BLOG_POSTS } from "@/lib/blog-registry";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Three posts from the journal.
 *
 * Read from the same registry the listing page and the sitemap use, newest
 * first, so a new post appears here the moment it is published and no one
 * has to remember to update the home page. There is no "featured" flag:
 * a flag is a second place to be wrong.
 */
export function JournalPreview() {
  const posts = [...BLOG_POSTS]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 3);

  if (posts.length === 0) return null;

  return (
    <section
      aria-labelledby="journal-heading"
      className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <Eyebrow as="h2">Field notes</Eyebrow>
          <p
            id="journal-heading"
            className="mt-5 font-display text-34 text-ek-green-900 lg:text-46"
          >
            What we learned buying from five districts.
          </p>
        </div>
        <Link
          href="/blog"
          className="link-draw pb-2 text-17 text-ek-green-900"
        >
          All of the journal
        </Link>
      </div>

      <ul className="mt-12 grid gap-x-10 gap-y-12 lg:grid-cols-3">
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
              <h3 className="mt-4 font-display text-26 text-ek-green-900">
                <Link
                  href={`/blog/${post.slug}`}
                  className="transition-colors hover:text-ek-gold-800"
                >
                  {post.title}
                </Link>
              </h3>
              <p className="mt-3 text-15 text-ek-green-700">{post.excerpt}</p>
            </article>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
