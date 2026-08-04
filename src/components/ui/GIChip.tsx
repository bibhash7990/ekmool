import { SealIcon } from "@/components/icons";

/** GI-tag chip — gold-100 field, seal derived from the mark's ring. */
export function GIChip({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm bg-ek-gold-100 px-2.5 py-1 text-15 leading-none text-ek-green-900 ${className}`.trim()}
    >
      <SealIcon className="size-3.5 shrink-0 text-ek-gold-600" />
      <span className="font-medium">{label}</span>
    </span>
  );
}
