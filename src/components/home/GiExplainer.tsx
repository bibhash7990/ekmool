import Link from "next/link";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { GIChip } from "@/components/ui/GIChip";

/**
 * What a GI tag is, and — the part most pages skip — what it is not.
 *
 * The five registered names are the ones on the GI Registry, spelled as
 * they are registered. That matters: "Kandhamal Haladi" is the protected
 * name, "Kandhamal turmeric" is a description of it. Getting a registered
 * name wrong on a page that explains registered names is the kind of
 * detail a reader who knows the subject will notice first.
 *
 * The "what it does not tell you" column is here because it is true and
 * because leaving it out would make this a sales page pretending to be an
 * explainer. A shop that tells you the limits of its own credential is
 * easier to believe about everything else.
 */
const REGISTERED = [
  { name: "Kandhamal Haladi", what: "Turmeric · Odisha" },
  { name: "Lakadong Turmeric", what: "Turmeric · Meghalaya" },
  { name: "Mithila Makhana", what: "Fox nuts · Bihar" },
  { name: "Guntur Sannam Chilli", what: "Chilli · Andhra Pradesh" },
  { name: "Byadagi Chilli", what: "Chilli · Karnataka" },
] as const;

export function GiExplainer() {
  return (
    <section
      aria-labelledby="gi-heading"
      className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24"
    >
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div>
          <Eyebrow as="h2">The badge</Eyebrow>
          <p
            id="gi-heading"
            className="mt-5 font-display text-34 text-ek-green-900 lg:text-46"
          >
            What a GI tag actually guarantees.
          </p>
          <p className="mt-6 max-w-[46ch] text-17 text-ek-green-700">
            A Geographical Indication is a legal name, granted under the
            Geographical Indications of Goods Act 1999 and administered from
            the registry in Chennai. It says a food comes from one defined
            place and was made the way that place makes it.
          </p>
          <Link
            href="/blog/what-is-a-gi-tag"
            className="link-draw mt-7 inline-block text-17 text-ek-green-900"
          >
            The longer answer, in the journal
          </Link>
        </div>

        <div>
          <ul className="flex flex-wrap gap-2.5">
            {REGISTERED.map((entry) => (
              <li key={entry.name}>
                <GIChip label={entry.name} />
                <span className="sr-only"> — {entry.what}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="eyebrow text-ek-green-700">What it does tell you</h3>
              <ul className="mt-4 flex flex-col gap-3 text-17 text-ek-green-900">
                <li className="max-w-[38ch]">
                  Where it was grown, down to a district rather than a
                  country.
                </li>
                <li className="max-w-[38ch]">
                  That the variety and the method are the registered ones,
                  not a lookalike grown elsewhere.
                </li>
                <li className="max-w-[38ch]">
                  That there is a registered proprietor who can act against
                  anyone using the name falsely.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="eyebrow text-ek-green-700">
                What it does not
              </h3>
              <ul className="mt-4 flex flex-col gap-3 text-17 text-ek-green-700">
                <li className="max-w-[38ch]">
                  It is not an organic certification. Those are separate,
                  and a GI product may or may not hold one.
                </li>
                <li className="max-w-[38ch]">
                  It is not a grade. Two GI-tagged lots from the same
                  district can differ a great deal.
                </li>
                <li className="max-w-[38ch]">
                  It is not a promise about your health, and anyone
                  attaching one to a spice is telling you something the tag
                  does not say.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
