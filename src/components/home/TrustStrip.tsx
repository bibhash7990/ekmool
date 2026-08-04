import {
  SealIcon,
  CertificateIcon,
  SproutIcon,
  ShieldIcon,
} from "@/components/icons";

const ITEMS = [
  { Icon: SealIcon, label: "GI-Tagged" },
  { Icon: CertificateIcon, label: "FSSAI Licensed" },
  { Icon: SproutIcon, label: "Single Origin" },
  { Icon: ShieldIcon, label: "Secure Payments" },
] as const;

/** Quiet row of assurances — used on home and every product page. */
export function TrustStrip({ className = "" }: { className?: string }) {
  return (
    <ul
      className={`grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 ${className}`.trim()}
    >
      {ITEMS.map(({ Icon, label }) => (
        <li
          key={label}
          className="flex items-center gap-2.5 text-ek-green-700"
        >
          <Icon className="size-5 shrink-0" />
          <span className="text-15">{label}</span>
        </li>
      ))}
    </ul>
  );
}
