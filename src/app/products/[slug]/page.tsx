import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getCatalog, getProductBySlug } from "@/db/queries/products";
import { getProductReviews } from "@/db/queries/reviews";
import { getProductContent, PRODUCT_CONTENT } from "@/content/products";
import { appUrl } from "@/lib/env";
import { turnstileSiteKey } from "@/lib/turnstile";
import { formatPaise, paiseToRupees } from "@/lib/money";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";
import { JsonLd } from "@/components/seo/JsonLd";
import { TrustStrip } from "@/components/home/TrustStrip";
import { OriginLabel, AccentRule } from "@/components/product/OriginLabel";
import { ProductPurchase } from "@/components/product/ProductPurchase";
import { ProductFaqList } from "@/components/product/ProductFaq";
import { RelatedProducts } from "@/components/product/RelatedProducts";
import { RecentlyViewed } from "@/components/product/RecentlyViewed";
import { ProductReviews } from "@/components/product/ProductReviews";

export const revalidate = 3600;
export const dynamicParams = false;

/**
 * Rolling one-year offer horizon for AggregateOffer. Computed at module
 * load (build / server start) rather than during render — reading the
 * clock inside a component is impure, and a validity window does not need
 * per-request precision.
 */
const PRICE_VALID_UNTIL = new Date(Date.now() + 365 * 24 * 3600 * 1000)
  .toISOString()
  .slice(0, 10);

/**
 * The set of product pages that exist. Build-time only — with
 * `dynamicParams = false` the result is baked into the prerender manifest
 * and the running server resolves paths from that, never by calling this
 * again.
 *
 * Which is why it must not quietly return an empty list. A build run
 * against an unreachable or empty database would otherwise emit a
 * storefront with zero product pages and still exit 0 — a silent, shippable
 * catastrophe. PRODUCT_CONTENT is a compile-time constant and is the real
 * authority on which pages exist; the database only decides whether a
 * product is currently active. So prefer the database when it answers, and
 * fall back to the content keys when it does not, which turns that silent
 * failure into a loud one: the build proceeds to render those pages, the
 * catalogue read fails again, and the build stops.
 *
 * The trade-off is that a genuinely empty `products` table also falls
 * back. For a five-product catalogue that state means "the database is
 * broken", not "we sell nothing".
 */
export async function generateStaticParams() {
  const contentSlugs = Object.keys(PRODUCT_CONTENT);

  try {
    const products = await getCatalog();
    if (products.length > 0) {
      return products
        .filter((product) => contentSlugs.includes(product.slug))
        .map((product) => ({ slug: product.slug }));
    }
    console.error(
      "[products] catalogue read returned no rows — keeping the known product paths rather than 404ing them",
    );
  } catch (error) {
    console.error(
      "[products] catalogue read failed in generateStaticParams — falling back to content slugs",
      error,
    );
  }

  return contentSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  const content = getProductContent(slug);
  if (!product || !content) return {};

  return {
    title: content.titleTag,
    description: content.metaDescription,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      type: "website",
      url: `/products/${slug}`,
      title: `${content.titleTag} | Ekmool`,
      description: content.metaDescription,
      // No `images` here on purpose. opengraph-image.tsx in this folder
      // generates a per-product card at build time, and Next wires it up
      // automatically — listing an image here would override it with the
      // same logo on all five pages.
    },
    twitter: {
      card: "summary_large_image",
      title: `${content.titleTag} | Ekmool`,
      description: content.metaDescription,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [catalog, reviewData] = await Promise.all([
    getCatalog(),
    getProductReviews(slug),
  ]);
  const product = catalog.find((entry) => entry.slug === slug) ?? null;
  const content = getProductContent(slug);
  if (!product || !content) notFound();

  const prices = product.variants.map((v) => v.pricePaise);
  const lowPrice = Math.min(...prices);
  const highPrice = Math.max(...prices);
  const inStock = product.variants.some((v) => v.stockQty > 0);
  const primaryImage =
    product.images.find((i) => i.isPrimary) ?? product.images[0];

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: content.metaDescription,
    sku: product.variants[0]?.sku,
    image: primaryImage ? [`${appUrl}${primaryImage.url}`] : undefined,
    brand: { "@type": "Brand", name: "Ekmool" },
    countryOfOrigin: { "@type": "Country", name: "India" },
    /**
     * AggregateRating appears only when there are published reviews behind
     * it, and the numbers are the ones printed on the page.
     *
     * Emitting a rating with no ratings in it is the single most common
     * piece of structured-data fraud in ecommerce, it is a Google
     * spam-policy violation, and it would contradict the review section a
     * few hundred pixels below saying nobody has reviewed this yet.
     */
    ...(reviewData.rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviewData.rating.average,
            reviewCount: reviewData.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
          review: reviewData.reviews.slice(0, 5).map((review) => ({
            "@type": "Review",
            reviewRating: {
              "@type": "Rating",
              ratingValue: review.rating,
              bestRating: 5,
              worstRating: 1,
            },
            author: { "@type": "Person", name: review.displayName },
            name: review.title,
            reviewBody: review.body,
            datePublished: review.createdAt.toISOString().slice(0, 10),
          })),
        }
      : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: paiseToRupees(lowPrice).toFixed(2),
      highPrice: paiseToRupees(highPrice).toFixed(2),
      offerCount: product.variants.length,
      priceValidUntil: PRICE_VALID_UNTIL,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Ekmool" },
    },
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const paragraphs = content.h1
    ? product.longDescription.split(/\n\n+/).filter(Boolean)
    : [];

  return (
    <>
      <JsonLd data={[productJsonLd, faqJsonLd]} />

      <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8 lg:py-14">
        <Breadcrumbs
          items={[
            { href: "/products", label: "Shop" },
            { href: `/products/${product.slug}`, label: product.name },
          ]}
        />

        {/* ---------- Buy section ---------- */}
        <div className="mt-10 grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <div>
            <PhotoPlaceholder
              ratio="4 / 5"
              tone={product.accent}
              direction={content.heroArtDirection}
            />
            <ul className="mt-4 grid grid-cols-3 gap-4">
              {product.images.slice(1, 4).map((image) => (
                <li key={image.url}>
                  <PhotoPlaceholder
                    ratio="1 / 1"
                    tone={product.accent}
                    direction={image.altText}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <OriginLabel
              originState={product.originState}
              giTagName={product.giTagName}
            />
            <h1 className="mt-5 font-display text-46 text-ek-green-900">
              {content.h1}
            </h1>
            <p className="mt-4 text-20 text-ek-green-700">{content.tagline}</p>

            <div className="mt-8">
              <ProductPurchase
                productSlug={product.slug}
                productName={product.name}
                accent={product.accent}
                variants={product.variants}
                turnstileSiteKey={turnstileSiteKey}
              />
            </div>

            <p className="mt-6 max-w-[52ch] border-l-2 border-ek-gold-500 pl-4 text-15 text-ek-green-700">
              {content.useNote}
            </p>

            <TrustStrip className="mt-10 max-w-md" />
          </div>
        </div>

        <SoilLine className="my-16 lg:my-24" />

        {/* ---------- Origin story ---------- */}
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
          <section aria-labelledby="origin-heading">
            <Eyebrow as="h2" className="text-ek-green-700">
              <span id="origin-heading">The origin</span>
            </Eyebrow>
            <div className="mt-6 space-y-5 text-17 text-ek-green-700">
              {paragraphs.map((paragraph, i) => (
                <p key={i} className="max-w-[68ch]">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>

          <section aria-labelledby="specs-heading" className="lg:pt-1">
            <Eyebrow as="h2">
              <span id="specs-heading">At a glance</span>
            </Eyebrow>
            <div className="mt-6 border border-ek-green-200 bg-ek-paper">
              <AccentRule accent={product.accent} />
              <dl className="divide-y divide-ek-green-200">
                {content.specs.map((spec) => (
                  <div
                    key={spec.label}
                    className="grid grid-cols-[9rem_1fr] gap-4 px-5 py-3.5"
                  >
                    <dt className="text-15 text-ek-green-700">{spec.label}</dt>
                    <dd className="text-15 text-ek-green-900">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="mt-5 text-15 text-ek-green-700">
              Pack sizes from {formatPaise(lowPrice)}. See our{" "}
              <Link href="/shipping-policy" className="link-draw">
                shipping policy
              </Link>{" "}
              for delivery times across India.
            </p>
          </section>
        </div>

        <SoilLine className="my-16 lg:my-24" />

        {/* ---------- FAQ ---------- */}
        <section aria-labelledby="faq-heading" className="max-w-4xl">
          <Eyebrow as="h2">
            <span id="faq-heading">Questions people actually ask</span>
          </Eyebrow>
          <p className="mt-5 font-display text-34 text-ek-green-900">
            About {product.name.replace(" Powder", "")}
          </p>
          <div className="mt-10">
            <ProductFaqList faq={content.faq} headingId="faq-heading" />
          </div>
        </section>

        <SoilLine className="my-16 lg:my-24" />

        <ProductReviews
          productSlug={product.slug}
          productName={product.name}
          data={reviewData}
        />

        <SoilLine className="my-16 lg:my-24" />

        <RelatedProducts catalog={catalog} current={product} />

        {/* Slugs only, held in the visitor's own browser — see
            src/lib/recently-viewed.ts. The names and prices come from this
            server render, so nothing here can go stale. */}
        <RecentlyViewed
          currentSlug={product.slug}
          catalog={catalog.map((entry) => ({
            slug: entry.slug,
            name: entry.name,
            originState: entry.originState,
            fromPaise: Math.min(...entry.variants.map((v) => v.pricePaise)),
          }))}
        />
      </div>

      {/* Padding so the sticky mobile bar never covers page content */}
      <div className="h-24 md:hidden" aria-hidden="true" />
    </>
  );
}
