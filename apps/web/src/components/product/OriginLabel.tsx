import { GIChip } from "@/components/ui/GIChip";

/**
 * The origin-label treatment carried by every product card and page:
 * state name in letterspaced caps, GI chip, and the per-product accent
 * rule that makes a card read like a premium spice-tin label.
 */
export function OriginLabel({
  originState,
  giTagName,
  className = "",
}: {
  originState: string;
  giTagName: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`.trim()}>
      <span className="eyebrow text-ek-green-700">{originState}</span>
      <GIChip label={giTagName} />
    </div>
  );
}

/** Per-product accent rule — sits at the top of a card. */
export function AccentRule({
  accent,
  className = "",
}: {
  accent: "gold" | "terracotta" | "green";
  className?: string;
}) {
  const colors = {
    gold: "bg-ek-gold-500",
    terracotta: "bg-ek-terracotta",
    green: "bg-ek-green-700",
  } as const;

  return (
    <div
      className={`h-[3px] w-full ${colors[accent]} ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
