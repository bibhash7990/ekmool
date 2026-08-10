import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getCatalog, getProductBySlug } from "@/db/queries/products";
import { getProductReviews } from "@/db/queries/reviews";
import {
  getProductContent,
  fallbackContent,
  PRODUCT_CONTENT,
} from "@/content/products";
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

/**
 * True since M14, and the change is deliberate.
 *
 * It was false, which compiles to `fallback: false`: the prerender manifest
 * is the complete list of product pages that exist, and a slug not in it
 * 404s. That was right while the catalogue only changed with a deploy. It
 * stopped being right the moment the owner could create a product from the
 * admin — the product would exist, be buyable in theory, and have no page
 * until somebody rebuilt the site. A CMS whose output requires a deploy is
 * not a CMS.
 *
 * With `true` (fallback: 'blocking') the five known slugs still serve from
 * the static cache exactly as before; only an unknown slug renders on
 * demand, and a genuinely missing product still 404s via notFound() below.
 *
 * This does not relax the rule in src/lib/revalidate.ts. revalidatePath on
 * a product route is still forbidden there — the tag is the mechanism, and
 * stale-while-revalidate is still what we want.
 */
export const dynamicParams = true;

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
 * Which product pages to build ahead of time.
 *
 * Since M14 this is a performance decision rather than an existence one:
 * `dynamicParams` is true, so a slug missing from this list still renders,
 * it just renders on the first request instead of at build. Every active
 * product is prebuilt, including ones created in the admin that have no
 * editorial entry in PRODUCT_CONTENT — they were filtered out here before,
 * which is precisely why such a product had no page.
 *
 * The fallback to the content keys stays. A build run against an
 * unreachable or empty database would otherwise emit a storefront with zero
 * prebuilt product pages and still exit 0. PRODUCT_CONTENT is a
 * compile-time constant and knows the five launch products exist, so
 * falling back to it turns that silent failure into a loud one: the build
 * proceeds to render those pages, the catalogue read fails again, and the
 * build stops.
 */
export async function generateStaticParams() {
  const contentSlugs = Object.keys(PRODUCT_CONTENT);

  try {
    const products = await getCatalog();
    if (products.length > 0) {
      return products.map((product) => ({ slug: product.slug }));
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
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) return {};
  const content = getProductContent(slug) ?? fallbackContent(product);

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

  // The catch matters now that dynamicParams is true. A prerendered slug is
  // served from the static cache and never gets here during an outage, so
  // the only requests that reach a failing catalogue read are for slugs
  // that were not built — nonsense URLs and bots. Answering those with a
  // 404 is right; letting the read throw would answer a 500.
  const [catalog, reviewData] = await Promise.all([
    getCatalog().catch(() => [] as Awaited<ReturnType<typeof getCatalog>>),
    getProductReviews(slug).catch(() => ({ reviews: [], rating: null })),
  ]);
  const product = catalog.find((entry) => entry.slug === slug) ?? null;
  if (!product) notFound();
  const content = getProductContent(slug) ?? fallbackContent(product);

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

  /**
   * Only when there are questions. An FAQPage with an empty mainEntity is
   * invalid structured data, and filling it with plausible-sounding
   * questions nobody asked would be both a Google spam-policy violation and
   * a claim about customers that is not true. A product with no editorial
   * entry simply has no FAQ section and no FAQ schema.
   */
  const faqJsonLd =
    content.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: content.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  const paragraphs = content.h1
    ? product.longDescription.split(/\n\n+/).filter(Boolean)
    : [];

  return (
    <>
      <JsonLd data={faqJsonLd ? [productJsonLd, faqJsonLd] : [productJsonLd]} />

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

        {content.faq.length > 0 && (
          <>
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
          </>
        )}

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
