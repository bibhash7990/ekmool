/**
 * The mark, redrawn as inline SVG so the taproot can draw itself in —
 * the site's single orchestrated load moment (~700ms). Pure CSS animation
 * (see globals.css), no client JS, and static under prefers-reduced-motion.
 */
export function TaprootMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 268"
      fill="none"
      className={className}
      role="img"
      aria-label="The Ekmool mark: a GI seal split by a soil line, two leaves above and one turmeric-gold taproot breaking through below"
    >
      <g transform="translate(10,8)">
        {/* seal ring + soil line + stem — fade in first */}
        <g className="taproot-crown">
          <path
            d="M 94.35 190.49 A 82.0 82.0 0 1 1 125.65 190.49"
            stroke="var(--color-ek-green-900)"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M 47 118 H 99 M 121 118 H 173"
            stroke="var(--color-ek-green-900)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M 110 118 V 88"
            stroke="var(--color-ek-green-900)"
            strokeWidth="6.5"
            strokeLinecap="round"
          />
          <path
            d="M 110 96 C 95 92, 81 80, 78 61 C 97 64, 108 79, 110 96 Z"
            fill="var(--color-ek-green-900)"
          />
          <path
            d="M 110 96 C 125 92, 139 80, 142 61 C 123 64, 112 79, 110 96 Z"
            fill="var(--color-ek-green-900)"
          />
        </g>

        {/* the taproot draws downward through the seal */}
        <path
          className="taproot-root"
          d="M 110 118 V 240"
          stroke="var(--color-ek-gold-500)"
          strokeWidth="11"
          strokeLinecap="round"
          pathLength={1}
        />
        <path
          className="taproot-hair"
          d="M 108.4 158 C 103 162, 98.6 167, 96 173"
          stroke="var(--color-ek-gold-500)"
          strokeWidth="3.2"
          strokeLinecap="round"
          pathLength={1}
        />
        <path
          className="taproot-hair"
          d="M 111.6 176 C 116.6 180, 120.4 184.5, 123 190"
          stroke="var(--color-ek-gold-500)"
          strokeWidth="3.2"
          strokeLinecap="round"
          pathLength={1}
        />
      </g>
    </svg>
  );
}
