import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";
import { TaprootMark } from "@/components/home/TaprootMark";
import { TrustStrip } from "@/components/home/TrustStrip";

export const metadata: Metadata = {
  title: "About Ekmool — One Root, One Soil, Five Districts",
  description:
    "Why Ekmool buys only inside GI boundaries, how we source from farmer collectives in five Indian districts, and what the mark on every pack actually means.",
  alternates: { canonical: "/about" },
  openGraph: {
    url: "/about",
    title: "About Ekmool — One Root, One Soil | Ekmool",
    description:
      "How and why we buy only inside GI boundaries, direct from farmer collectives in five Indian districts.",
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ href: "/about", label: "About" }]} />

      <header className="mt-10 max-w-3xl">
        <Eyebrow>Ek · one · मूल · root</Eyebrow>
        <h1 className="mt-5 font-display text-46 text-ek-green-900 lg:text-64">
          One root, one soil.
        </h1>
        <p className="mt-7 text-20 text-ek-green-700">
          Ekmool exists because the most interesting foods in India are tied to
          specific places, and almost nothing on a supermarket shelf will tell
          you which place. We buy inside five Geographical Indication
          boundaries, name the district on every pack, and mill in small batches
          so what arrives still smells of the field.
        </p>
      </header>

      <SoilLine align="left" className="my-14 max-w-sm" />

      <div className="grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <div>
          <section aria-labelledby="why-heading">
            <h2
              id="why-heading"
              className="font-display text-34 text-ek-green-900"
            >
              Why single origin, and why only five
            </h2>
            <div className="mt-6 space-y-5 text-17 text-ek-green-700">
              <p className="max-w-[68ch]">
                Most turmeric on an Indian shelf is a blend — several states,
                several harvests, whatever the mill could buy that month. It is
                cheaper to make and impossible to trace. Blending is not
                dishonest in itself; it is simply how a commodity market works.
                But it means the words on the front of the pack cannot tell you
                anything specific, because there is nothing specific to tell.
              </p>
              <p className="max-w-[68ch]">
                A Geographical Indication does the opposite. It ties a food to
                the one district whose soil, altitude and practice made it worth
                naming, and it makes that claim legally checkable rather than
                decorative. We work only inside those boundaries. That means
                smaller lots, seasonal gaps we do not paper over, and a price
                that reflects what a farmer in the Jaintia Hills is actually
                owed.
              </p>
              <p className="max-w-[68ch]">
                Five products is a deliberate limit, not a starting inventory.
                Each one is a food where the place genuinely changes the
                product: Lakadong&apos;s curcumin collapses at lower altitude,
                Byadagi is grown for pigment rather than heat, Mithila makhana
                depends on a hand-popping tradition that exists in north Bihar
                and effectively nowhere else. We would rather know five supply
                chains properly than fifty superficially.
              </p>
            </div>
          </section>

          <SoilLine align="left" className="my-12 max-w-[10rem]" />

          <section aria-labelledby="how-heading">
            <h2
              id="how-heading"
              className="font-display text-34 text-ek-green-900"
            >
              How we actually buy
            </h2>
            <div className="mt-6 space-y-5 text-17 text-ek-green-700">
              <p className="max-w-[68ch]">
                We buy through farmer producer organisations and collectives
                inside each GI area, at declared rates, rather than through the
                chain of traders that normally sits between a hill farm and a
                city shelf. It is slower and it costs more. It is also the only
                way to answer the question &ldquo;who grew this?&rdquo; with
                something other than a shrug.
              </p>
              <p className="max-w-[68ch]">
                Spices are milled in small batches and packed within days of
                grinding, because ground spice loses its volatile oils quickly —
                that is the difference between turmeric that smells of earth and
                warm pepper when you open the pack and turmeric that smells of
                nothing. Nothing is blended in: no husk, no bran, no rice
                starch, no anti-caking agent, no synthetic colour.
              </p>
              <p className="max-w-[68ch]">
                One consequence worth stating plainly: because we do not
                colour-correct, the shade of our chilli and turmeric shifts a
                little between lots across a season. Powders that look identical
                every single month have usually been standardised. We would
                rather explain the variation than remove it.
              </p>
            </div>
          </section>

          <SoilLine align="left" className="my-12 max-w-[10rem]" />

          <section aria-labelledby="claims-heading">
            <h2
              id="claims-heading"
              className="font-display text-34 text-ek-green-900"
            >
              What we will and will not claim
            </h2>
            <div className="mt-6 space-y-5 text-17 text-ek-green-700">
              <p className="max-w-[68ch]">
                We publish curcumin as a range rather than a single flattering
                number, because an agricultural product varies by harvest and a
                fixed figure printed year-round would not be honest. We say
                &ldquo;organic by tradition&rdquo; where that is the accurate
                description and reserve the word &ldquo;certified&rdquo; for
                lots that actually hold a certificate.
              </p>
              <p className="max-w-[68ch]">
                We do not make health claims. Turmeric, chilli and makhana have
                been used in Indian kitchens for centuries and there is a great
                deal of research interest in them, but we are a food company and
                not a medical one. We will tell you where a crop grew, how it
                was processed and what it contains. What it might do for you is
                a conversation for you and your doctor.
              </p>
              <p className="max-w-[68ch]">
                And we do not invent reviews, ratings or countdown timers. When
                a page says only a few packs are left, that number is read from
                real stock.{" "}
                <Link href="/blog/what-is-a-gi-tag" className="link-draw">
                  Our piece on GI tags
                </Link>{" "}
                is as candid about their limits as about their value, which is
                the standard we are trying to hold ourselves to generally.
              </p>
            </div>
          </section>
        </div>

        <aside className="lg:pt-2">
          <PhotoPlaceholder
            ratio="4 / 5"
            tone="green"
            direction="Documentary, not styled: a farmer's hands holding freshly lifted turmeric rhizomes with soil still on them, shallow depth of field, overcast hill light. Face out of frame or consented — no stock-photo staging."
          />

          <section
            aria-labelledby="mark-heading"
            className="mt-12 border border-ek-green-200 bg-ek-paper p-6"
          >
            <div className="flex items-start gap-5">
              <TaprootMark className="h-24 w-auto shrink-0" />
              <div>
                <h2
                  id="mark-heading"
                  className="font-display text-20 text-ek-green-900"
                >
                  The mark
                </h2>
                <p className="mt-3 text-15 text-ek-green-700">
                  A circular seal — the language of GI certification stamps —
                  split by a soil line. Two leaves above, one turmeric-gold
                  taproot below, tapering like the numeral 1 for{" "}
                  <em>ek</em>, and breaking through the ring at the bottom.
                </p>
                <p className="mt-3 text-15 text-ek-green-700">
                  The root breaks the seal on purpose: the badge is where the
                  story starts, not where it ends. The root runs deeper than the
                  badge.
                </p>
              </div>
            </div>
          </section>

          <section aria-labelledby="who-heading" className="mt-10">
            <h2 id="who-heading" className="eyebrow text-ek-green-700">
              Who we are
            </h2>
            <p className="mt-5 text-15 text-ek-green-700">
              Ekmool is a small direct-to-consumer food business based in India,
              selling only online and only what we can trace. We are FSSAI
              licensed, we ship nationwide, and every order is packed by the
              same people who buy the crop.
            </p>
            <p className="mt-4 text-15 text-ek-green-700">
              Questions about sourcing, a specific lot, or bulk orders?{" "}
              <Link href="/contact" className="link-draw">
                Write to us
              </Link>{" "}
              — sourcing questions are the ones we most enjoy answering.
            </p>
          </section>
        </aside>
      </div>

      <div className="mt-20 border-t border-ek-green-200 pt-10">
        <TrustStrip className="max-w-3xl" />
      </div>
    </div>
  );
}
