import type { Metadata } from "next";
import Link from "next/link";

import { getCatalog } from "@/db/queries/products";
import { getRecentReviews } from "@/db/queries/reviews";
import { getContent, t } from "@/lib/content";
import { FREE_SHIPPING_THRESHOLD_PAISE } from "@/lib/constants";
import { formatPaise } from "@/lib/money";
import { productItemListJsonLd } from "@/lib/seo/jsonld";

import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { Reveal } from "@/components/ui/Reveal";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";
import { JsonLd } from "@/components/seo/JsonLd";
import { TaprootMark } from "@/components/home/TaprootMark";
import { TrustStrip } from "@/components/home/TrustStrip";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { ProcessSteps } from "@/components/home/ProcessSteps";
import { GiExplainer } from "@/components/home/GiExplainer";
import { JournalPreview } from "@/components/home/JournalPreview";
import { HomeReviews } from "@/components/home/HomeReviews";
import { DeliveryStrip } from "@/components/home/DeliveryStrip";
import { HomeFaq } from "@/components/home/HomeFaq";
import { PinIcon } from "@/components/icons";

/**
 * Static, and revalidated by tag rather than by clock.
 *
 * The hour here is a backstop. Publishing a product or a review purges
 * PRODUCTS_TAG / REVIEWS_TAG and this page rebuilds within seconds — see
 * src/lib/revalidate.ts, and note that revalidatePath must never be used
 * on a product route.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Ekmool — GI-Tagged Single-Origin Indian Foods",
  description:
    "Turmeric, makhana and chilli from the one district that earned each GI tag — Kandhamal, Lakadong, Mithila, Guntur, Byadagi. Milled fresh, shipped across India.",
  alternates: { canonical: "/" },
};

const ORIGINS = [
  {
    state: "Odisha",
    district: "Kandhamal",
    product: "Turmeric",
    slug: "kandhamal-turmeric-powder",
    note: "Grown without chemical inputs in tribal hill plots, sun-dried on stone.",
  },
  {
    state: "Meghalaya",
    district: "Lakadong",
    product: "Turmeric",
    slug: "lakadong-turmeric-powder",
    note: "The Jaintia Hills cultivar prized for the highest curcumin in India.",
  },
  {
    state: "Bihar",
    district: "Mithila",
    product: "Makhana",
    slug: "mithila-makhana",
    note: "Hand-popped fox nuts from pond beds worked by the Mallah community.",
  },
  {
    state: "Andhra Pradesh",
    district: "Guntur",
    product: "Chilli",
    slug: "guntur-chilli-powder",
    note: "Sannam S4 — the heat that defines Andhra kitchens.",
  },
  {
    state: "Karnataka",
    district: "Byadagi",
    product: "Chilli",
    slug: "byadagi-chilli-powder",
    note: "Deep wrinkled pods that give colour without the burn.",
  },
] as const;

export default async function HomePage() {
  // All three are cached and tagged, so this page is built once and served
  // from static output — browsing the home page never touches MySQL, which
  // is the property scripts/chaos.mjs and test:db-down assert. getContent
  // holds that line too: it falls back to the compiled-in defaults, so an
  // unreachable database changes the copy not at all.
  const [products, reviews, content] = await Promise.all([
    getCatalog(),
    getRecentReviews(3),
    getContent(),
  ]);

  return (
    <>
      <JsonLd data={productItemListJsonLd(products)} />

      {/* ---------- 1 · HERO: asymmetric split ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 pt-12 pb-16 lg:px-8 lg:pt-20 lg:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <Eyebrow>{t(content, "home.hero.eyebrow")}</Eyebrow>

            {/*
              Three keys, not one. The line break and the gold word are
              design rather than copy: an editable string carrying the
              markup would let a typo in /admin break the heading, and a
              single flat string would silently drop both.
            */}
            <h1 className="mt-6 font-display text-46 text-ek-green-900 lg:text-64">
              {t(content, "home.hero.heading.line1")}
              <br />
              {t(content, "home.hero.heading.line2")}{" "}
              <span className="text-ek-gold-800">
                {t(content, "home.hero.heading.accent")}
              </span>
              .
            </h1>

            <p className="mt-7 max-w-[46ch] text-20 text-ek-green-700">
              {t(content, "home.hero.body")}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-6">
              <ButtonLink href="/products" size="lg">
                {t(content, "home.hero.cta.primary")}
              </ButtonLink>
              <Link
                href="/about"
                className="link-draw text-17 text-ek-green-900"
              >
                How we source
              </Link>
            </div>

            {/*
              The threshold is read from the constant the cart actually
              charges from, so this line cannot advertise free delivery the
              checkout does not give. Cash on Delivery is stated up front
              because for a large share of Indian buyers it is the question
              that decides whether they read any further.
            */}
            <p className="mt-6 text-15 text-ek-green-700">
              Free delivery above{" "}
              {formatPaise(FREE_SHIPPING_THRESHOLD_PAISE)} · Cash on Delivery
              across India
            </p>

            <TrustStrip className="mt-12 max-w-lg" />
          </div>

          {/* Right: the mark drawing itself in, over the product photograph */}
          <div className="relative">
            <PhotoPlaceholder
              ratio="4 / 5"
              tone="gold"
              direction="Overhead: loose turmeric powder mounded on raw jute, brass measuring cup half-buried, a single dried rhizome at the edge. Hard warm side light, deep shadow, no props from outside the region."
              className="w-full"
            />
            <div className="absolute -bottom-6 -left-4 flex items-end gap-4 bg-ek-paper py-4 pr-5 pl-4 shadow-hairline sm:-left-8">
              <TaprootMark className="h-20 w-auto" />
              <p className="mb-1 max-w-[18ch] text-15 text-ek-green-700">
                One seal. One soil. One root.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1180px] px-5 lg:px-8">
        <SoilLine />
      </div>

      {/* ---------- 2 · THE SHELF, WITH PRICES ---------- */}
      <FeaturedProducts products={products} />

      {/* ---------- 3 · ORIGIN STRIP ---------- */}
      <section
        aria-labelledby="origins-heading"
        className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24"
      >
        <div className="max-w-2xl">
          <Eyebrow as="h2">The five origins</Eyebrow>
          <p
            id="origins-heading"
            className="mt-5 font-display text-34 text-ek-green-900 lg:text-46"
          >
            Every pack names its district, not just its country.
          </p>
        </div>

        <ul className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {ORIGINS.map((origin, i) => (
            <Reveal as="li" key={origin.slug} index={i}>
              <Link href={`/products/${origin.slug}`} className="group block">
                <div className="flex items-center gap-2 text-ek-green-700">
                  <PinIcon className="size-4 shrink-0" />
                  <span className="eyebrow text-ek-green-700">
                    {origin.state}
                  </span>
                </div>
                <h3 className="mt-3 font-display text-26 text-ek-green-900 transition-colors group-hover:text-ek-gold-800">
                  {origin.district} {origin.product}
                </h3>
                <p className="mt-2.5 text-15 text-ek-green-700">
                  {origin.note}
                </p>
              </Link>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* ---------- 4 · HOW A PACK IS MADE ---------- */}
      <ProcessSteps />

      {/* ---------- 5 · DARK BRAND BAND ---------- */}
      <section className="grain-dark bg-ek-green-950 text-ek-cream">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-8 lg:py-28">
          <div>
            <Eyebrow className="text-ek-gold-500">Why single origin</Eyebrow>
            <h2 className="mt-6 font-display text-34 text-ek-cream lg:text-46">
              Blended spice hides its history.
              <br />
              Ours can&apos;t.
            </h2>
          </div>
          <div className="space-y-6 text-17 text-ek-cream/80">
            <p>
              Most turmeric on an Indian shelf is a blend — several states,
              several harvests, whatever the mill could buy that month. It is
              cheaper to make and impossible to trace. A Geographical
              Indication does the opposite: it ties a food to the one place
              whose soil, altitude and practice made it worth naming.
            </p>
            <p>
              We work only inside those boundaries. That means smaller lots,
              seasonal gaps we don&apos;t paper over, and a price that reflects
              what a farmer in the Jaintia Hills is actually owed. In return
              you get colour, aroma and curcumin that a blend cannot fake.
            </p>
            <Link
              href="/blog/what-is-a-gi-tag"
              className="link-draw inline-block text-ek-gold-500"
            >
              What a GI tag actually guarantees
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- 6 · WHAT THE BADGE DOES AND DOES NOT SAY ---------- */}
      <GiExplainer />

      {/* ---------- 7 · FROM THE JOURNAL ---------- */}
      <JournalPreview />

      {/*
        8 · REAL REVIEWS, OR NOTHING.
        Renders null while nothing is published — no placeholder, no empty
        stars. See the component for the reasoning.
      */}
      <HomeReviews reviews={reviews} />

      {/* ---------- 9 · DELIVERY, PAYMENT, RETURNS ---------- */}
      <DeliveryStrip />

      {/* ---------- 10 · QUESTIONS ---------- */}
      <HomeFaq />

      {/* ---------- 11 · CLOSING CTA ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.8fr] lg:gap-20">
          <div>
            <h2 className="font-display text-34 text-ek-green-900 lg:text-46">
              Start with the turmeric everyone argues about.
            </h2>
            <p className="mt-6 max-w-[52ch] text-17 text-ek-green-700">
              Lakadong carries the highest curcumin in the country; Kandhamal
              is the organic benchmark. Buy both and settle it in your own
              kitchen.
            </p>
            <ButtonLink href="/products" size="lg" className="mt-9">
              See all five
            </ButtonLink>
          </div>
          <PhotoPlaceholder
            ratio="5 / 4"
            tone="green"
            direction="Two open kraft pouches side by side on weathered wood, turmeric spilling in two distinct yellows — Lakadong deeper orange, Kandhamal lighter gold. Top-down, soft window light from the left."
          />
        </div>
      </section>
    </>
  );
}
