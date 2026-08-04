/**
 * Warm-neutral placeholder for photography that hasn't been shot yet.
 * Carries the art direction in a visible caption + the alt text so a real
 * frame can be dropped in later at the same aspect ratio, zero CLS.
 *
 * Deliberately NOT a grey box with an image glyph — it reads as tinted
 * paper stock with the brand's hairline rule. The caption sits at the top
 * so overlay elements can anchor to the lower edge without colliding.
 */
export function PhotoPlaceholder({
  ratio = "4 / 5",
  tone = "gold",
  direction,
  className = "",
}: {
  /** CSS aspect-ratio, e.g. "4 / 5". Reserves space → no layout shift. */
  ratio?: string;
  tone?: "gold" | "terracotta" | "green";
  /** Art-direction note for the photographer. */
  direction: string;
  className?: string;
}) {
  const tones = {
    gold: "bg-ek-gold-100",
    terracotta:
      "bg-[color-mix(in_srgb,var(--color-ek-terracotta)_14%,var(--color-ek-paper))]",
    green:
      "bg-[color-mix(in_srgb,var(--color-ek-green-200)_55%,var(--color-ek-paper))]",
  } as const;

  return (
    <figure
      className={`relative overflow-hidden border border-ek-green-200 ${tones[tone]} ${className}`.trim()}
      style={{ aspectRatio: ratio }}
    >
      <div className="absolute inset-x-0 top-0 p-5">
        <div className="h-px w-16 bg-ek-green-900/20" />
        <figcaption className="mt-3 max-w-[34ch] text-15 text-ek-green-700/70 italic">
          {direction}
        </figcaption>
      </div>
    </figure>
  );
}
