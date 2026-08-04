import type { Metadata } from "next";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { Reveal } from "@/components/ui/Reveal";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";
import { TaprootMark } from "@/components/home/TaprootMark";
import { TrustStrip } from "@/components/home/TrustStrip";
import { PinIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Ekmool — GI-Tagged Single-Origin Indian Foods",
  description:
    "Turmeric, makhana and chilli sourced from the one district that earned each GI tag. Kandhamal, Lakadong, Mithila, Guntur, Byadagi — traced, milled fresh, shipped across India.",
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

export default function HomePage() {
  return (
    <>
      {/* ---------- HERO: asymmetric split ---------- */}
      <section className="mx-auto max-w-[1180px] px-5 pt-12 pb-16 lg:px-8 lg:pt-20 lg:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <Eyebrow>Single Origin · GI-Tagged · India</Eyebrow>

            <h1 className="mt-6 font-display text-46 text-ek-green-900 lg:text-64">
              The root runs deeper
              <br />
              than the <span className="text-ek-gold-600">badge</span>.
            </h1>

            <p className="mt-7 max-w-[46ch] text-20 text-ek-green-700">
              Five foods, five districts, one standard. We buy where the
              Geographical Indication was earned — Kandhamal, Lakadong,
              Mithila, Guntur, Byadagi — and mill in small batches so what
              reaches you still smells of the field it came from.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-6">
              <ButtonLink href="/products" size="lg">
                Shop single origin
              </ButtonLink>
              <Link
                href="/about"
                className="link-draw text-17 text-ek-green-900"
              >
                How we source
              </Link>
            </div>

            <TrustStrip className="mt-14 max-w-lg" />
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

      {/* ---------- ORIGIN STRIP ---------- */}
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
                <h3 className="mt-3 font-display text-26 text-ek-green-900 transition-colors group-hover:text-ek-gold-600">
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

      {/* ---------- DARK BRAND BAND ---------- */}
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

      {/* ---------- CLOSING CTA ---------- */}
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
