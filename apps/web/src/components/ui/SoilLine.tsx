/**
 * THE signature element: a hairline rule broken by a gold root-tick that
 * drops below it. Used once between major sections — never decoratively.
 * Server component, pure SVG, no client JS.
 */
export function SoilLine({
  className = "",
  align = "center",
}: {
  className?: string;
  /** Where the root breaks through the line. */
  align?: "left" | "center";
}) {
  return (
    <div
      className={`relative w-full ${className}`}
      role="presentation"
      aria-hidden="true"
    >
      <div className="h-px w-full bg-ek-green-200" />
      <svg
        viewBox="0 0 24 26"
        width="24"
        height="26"
        fill="none"
        className={`absolute top-0 ${
          align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
        }`}
      >
        {/* taproot tick — tapers like the numeral 1, breaking the soil line */}
        <path
          d="M12 0 C12.4 8, 12.8 15, 12 24 C11.2 15, 11.6 8, 12 0 Z"
          fill="var(--color-ek-gold-500)"
        />
        <path
          d="M11.4 12 C9.6 13.4, 8.4 14.8, 7.6 16.6"
          stroke="var(--color-ek-gold-500)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
