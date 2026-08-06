import { Eyebrow } from "@/components/ui/Eyebrow";

/**
 * How a pack actually gets made, in four steps.
 *
 * Every line here is a fact about the operation, not a promise about the
 * food. "Milled in small batches" is a description of how we work;
 * "boosts immunity" would be a health claim, which the FSSAI Act forbids
 * on food packaging and marketing and which this shop does not make
 * anywhere.
 *
 * The numbers are set in the display face at a size that carries the
 * section on its own, because there is no photograph here and a wall of
 * body copy in four columns reads as filler.
 *
 * They are gold-800, not the gold-600 they were first drawn in: axe put
 * that pairing at 3.1:1 on paper. gold-800 is the only gold in the palette
 * that is safe as ink on a light field — docs/DESIGN-SYSTEM.md says so,
 * and this is what ignoring it looks like.
 */
const STEPS = [
  {
    n: "01",
    title: "Bought inside the boundary",
    body: "Not from a mandi that aggregates four states. We buy in the district that earned the Geographical Indication — Kandhamal, Lakadong, Mithila, Guntur, Byadagi — from farmers and collectives working inside it. That is a smaller pool and a higher price, and it is the only way the name on the pack means anything.",
  },
  {
    n: "02",
    title: "Dried the way the region dries it",
    body: "Sun on stone in Kandhamal, mats in the open for Nilgiri-grade drying, hand-popping for Mithila makhana. Mechanical drying is faster and takes the top notes with it. Where a region has a method that survived because it works, we pay for the slower one.",
  },
  {
    n: "03",
    title: "Milled in small batches, late",
    body: "Ground spice starts losing its volatile oil the hour it is broken. We mill against demand rather than into a warehouse, so the gap between the mill and your kitchen is weeks, not a year. It is why the colour varies a little between orders — that is a harvest, not a formula.",
  },
  {
    n: "04",
    title: "Sealed, labelled, and traceable",
    body: "Food-grade pouches with a real seal, the district and the GI name on the front, and net weight, batch, packing date and FSSAI licence where Legal Metrology requires them. Every order carries a GST-compliant invoice you can hand to an accountant.",
  },
] as const;

export function ProcessSteps() {
  return (
    <section
      aria-labelledby="process-heading"
      className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24"
    >
      <div className="max-w-2xl">
        <Eyebrow as="h2">From the field</Eyebrow>
        <p
          id="process-heading"
          className="mt-5 font-display text-34 text-ek-green-900 lg:text-46"
        >
          Four steps, and the slow one is deliberate.
        </p>
      </div>

      <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2">
        {STEPS.map((step) => (
          <li key={step.n} className="flex gap-6">
            <span
              aria-hidden="true"
              className="shrink-0 font-display text-34 text-ek-gold-800"
            >
              {step.n}
            </span>
            <div>
              <h3 className="font-display text-26 text-ek-green-900">
                {step.title}
              </h3>
              <p className="mt-3 max-w-[52ch] text-17 text-ek-green-700">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
