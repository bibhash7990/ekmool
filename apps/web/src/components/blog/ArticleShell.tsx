import Link from "next/link";
import { getBlogPost } from "@/lib/blog-registry";
import { appUrl } from "@/lib/env";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { JsonLd } from "@/components/seo/JsonLd";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Wraps every MDX post: breadcrumbs, the visible byline, Article JSON-LD
 * and the closing shop link. Posts supply only their prose.
 */
export function ArticleShell({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const post = getBlogPost(slug);
  if (!post) throw new Error(`Blog post "${slug}" is missing from the registry`);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: { "@type": "Organization", name: "Ekmool", url: appUrl },
    publisher: {
      "@type": "Organization",
      name: "Ekmool",
      logo: {
        "@type": "ImageObject",
        url: `${appUrl}/brand/ekmool-logo-primary-2048.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${appUrl}/blog/${post.slug}`,
    },
  };

  return (
    <>
      <JsonLd data={articleJsonLd} />
      <article className="mx-auto max-w-[840px] px-5 py-10 lg:py-14">
        <Breadcrumbs
          items={[
            { href: "/blog", label: "Journal" },
            { href: `/blog/${post.slug}`, label: post.title },
          ]}
        />

        <header className="mt-10">
          <Eyebrow>
            <time dateTime={post.publishedAt}>
              {DATE_FORMAT.format(new Date(post.publishedAt))}
            </time>
            {" · "}
            {post.readingMinutes} min read
          </Eyebrow>
          <h1 className="mt-5 font-display text-46 text-ek-green-900 lg:text-64">
            {post.title}
          </h1>
          <p className="mt-6 max-w-[60ch] text-20 text-ek-green-700">
            {post.excerpt}
          </p>
        </header>

        <SoilLine align="left" className="my-12 max-w-xs" />

        <div>{children}</div>

        <SoilLine className="my-14" />

        <footer className="flex flex-wrap items-center justify-between gap-6">
          <p className="text-15 text-ek-green-700">
            Written by the Ekmool sourcing team.
          </p>
          <Link href="/products" className="link-draw text-17 text-ek-green-900">
            Shop the five origins
          </Link>
        </footer>
      </article>
    </>
  );
}
