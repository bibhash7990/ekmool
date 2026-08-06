/**
 * Five stars, filled to the nearest whole one.
 *
 * Shared by the product page and the home page so a rating never renders
 * two different ways on two routes. Server component, inline SVG, no
 * client JavaScript and no icon font.
 *
 * The accessible name is the number, not "five stars" — a screen reader
 * reading "star star star star star" for every review on a page is noise,
 * and the reader wants the value anyway.
 */
export function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span
      className="inline-flex gap-0.5 align-middle"
      role="img"
      aria-label={`${rating} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((position) => (
        <svg
          key={position}
          viewBox="0 0 20 20"
          className={`size-4 ${position <= filled ? "text-ek-gold-600" : "text-ek-green-200"}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M10 1.6l2.5 5.3 5.7.8-4.1 4 1 5.7L10 14.7 4.9 17.4l1-5.7-4.1-4 5.7-.8z" />
        </svg>
      ))}
    </span>
  );
}
