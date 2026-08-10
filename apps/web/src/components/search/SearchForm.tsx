import { SearchIcon } from "@/components/icons";

/**
 * The search box. A plain GET form to /search — no "use client", no state,
 * no bytes.
 *
 * That is not a shortcut, it is the correct shape for this. A form that
 * navigates works before hydration, works when a script fails, works on a
 * slow connection where the JS is still in flight, and gets keyboard
 * handling and browser history for free. The alternative — a controlled
 * input fetching suggestions per keystroke — would put a client component
 * in the root layout, which every page on the site then pays for, in
 * exchange for filtering five products.
 *
 * The interactivity lives on /search instead, where the results already
 * are, and where only people who went looking pay for it.
 */
export function SearchForm({
  id,
  variant = "full",
  defaultValue = "",
  autoFocus = false,
  className = "",
}: {
  /** Distinct per instance — the header and /search both render one. */
  id: string;
  /** `compact` is the header: the loupe is the submit control. */
  variant?: "compact" | "full";
  defaultValue?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const compact = variant === "compact";

  return (
    <form
      action="/search"
      method="get"
      role="search"
      className={`flex items-center border border-ek-green-200 bg-ek-paper transition-colors focus-within:border-ek-green-700 ${
        compact ? "gap-1 pl-1" : "gap-2 pl-3"
      } ${className}`}
    >
      <label htmlFor={id} className="sr-only">
        Search products
      </label>

      {compact ? (
        <button
          type="submit"
          aria-label="Search"
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center text-ek-green-700 hover:text-ek-green-900"
        >
          <SearchIcon className="size-[18px]" />
        </button>
      ) : (
        <SearchIcon className="size-[18px] shrink-0 text-ek-green-700" />
      )}

      <input
        id={id}
        type="search"
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        // enterKeyHint puts "Search" on the mobile keyboard's action key
        // rather than "Go", so the submit control is where the thumb
        // already is.
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={80}
        placeholder={compact ? "Search" : "Turmeric, makhana, haldi…"}
        className="min-h-11 w-full bg-transparent text-17 text-ek-green-900 outline-none placeholder:text-ek-green-700/70"
      />

      {!compact && (
        <button
          type="submit"
          className="min-h-11 shrink-0 cursor-pointer border-l border-ek-green-200 px-5 text-17 text-ek-green-900 hover:text-ek-gold-800"
        >
          Search
        </button>
      )}
    </form>
  );
}
