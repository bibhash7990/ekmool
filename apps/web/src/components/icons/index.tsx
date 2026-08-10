/**
 * Custom line icons — drawn to match the mark's stroke language
 * (round caps, ~1.5 stroke on a 24 grid). No icon fonts, no emoji.
 * All are server components; `currentColor` inherits the text colour.
 */

type IconProps = {
  className?: string;
};

function Svg({
  children,
  className = "",
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** GI seal — the mark's broken ring, reduced to a badge. */
export function SealIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.6 20.2a8.5 8.5 0 1 1 4.8 0" />
      <path d="M4 12h5.6M14.4 12H20" />
      <path d="M12 12v9" />
    </Svg>
  );
}

/** FSSAI / certified — a document with a check. */
export function CertificateIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9.2 13.6l2 2 3.8-4.2" />
    </Svg>
  );
}

/** Single origin — a sprout rising from one root. */
export function SproutIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21V10" />
      <path d="M12 12.5C9.6 12.2 7.4 10.4 6.8 7.4c3 .4 4.8 2.6 5.2 5.1Z" />
      <path d="M12 11.4c2-.4 3.8-2 4.3-4.5-2.5.4-4 2.2-4.3 4.5Z" />
      <path d="M6 21h12" />
    </Svg>
  );
}

/** Secure payments — a shield with a keyhole. */
export function ShieldIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3l7 2.6v5.6c0 4.4-2.9 7.6-7 9.2-4.1-1.6-7-4.8-7-9.2V5.6z" />
      <circle cx="12" cy="11" r="1.6" />
      <path d="M12 12.6V15" />
    </Svg>
  );
}

/** Cart. */
export function CartIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 4h2.2l2 11h10.4l2-8H6.4" />
      <circle cx="9" cy="19" r="1.3" />
      <circle cx="17" cy="19" r="1.3" />
    </Svg>
  );
}

/** Location pin — origin state marker. */
export function PinIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21s6.5-5.6 6.5-10.4A6.5 6.5 0 0 0 5.5 10.6C5.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.4" r="2.2" />
    </Svg>
  );
}

/** Truck — shipping. */
export function TruckIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 6h11v10H3z" />
      <path d="M14 9h4l3 3.2V16h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17.5" cy="18" r="1.6" />
    </Svg>
  );
}

/** Leaf — freshness / natural. */
export function LeafIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 4c0 8-4.6 12.4-10 12.4A5.4 5.4 0 0 1 4.6 11C4.6 5.6 12 4 20 4Z" />
      <path d="M4.5 20C7 15.5 11 12 16 10" />
    </Svg>
  );
}

/** Chevron — accordions, carets. */
export function ChevronIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 9.5l6 5.5 6-5.5" />
    </Svg>
  );
}

/** Menu / close for mobile nav. */
export function MenuIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

/** Search — the loupe, drawn on the same 24 grid as the rest. */
export function SearchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="6.25" />
      <path d="M15.6 15.6L20 20" />
    </Svg>
  );
}

/**
 * Wishlist. Takes `filled` rather than shipping two icons, because the
 * saved and unsaved states have to be the same shape in the same place —
 * a heart that changes outline is a state change, a heart that changes
 * silhouette is a different control.
 */
export function HeartIcon({
  className,
  filled = false,
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M12 20s-7.2-4.35-7.2-9.3A4.2 4.2 0 0 1 12 8.1a4.2 4.2 0 0 1 7.2 2.6c0 4.95-7.2 9.3-7.2 9.3z" />
    </svg>
  );
}
