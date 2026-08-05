import { HoneypotField } from "@/components/security/HoneypotField";

/**
 * The footer sign-up. A native form post to /api/newsletter/subscribe —
 * no "use client", no state, no bytes on any page.
 *
 * Double opt-in is stated on the form, not buried in the confirmation:
 * somebody deciding whether to type their address should know before they
 * do that a click in their inbox is still required, and that nothing
 * happens until then.
 */
export function NewsletterSignup() {
  return (
    <form
      action="/api/newsletter/subscribe"
      method="post"
      className="relative"
    >
      <HoneypotField />

      <h2 className="eyebrow text-ek-cream/60">The letter</h2>
      <p className="mt-5 max-w-xs text-15 text-ek-cream/75">
        Rarely, and only when there is something to say: a harvest landing, a
        batch milled, an origin worth writing about.
      </p>

      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <div className="mt-4 flex max-w-xs gap-2">
        <input
          id="newsletter-email"
          type="email"
          name="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder="you@example.com"
          className="min-h-11 min-w-0 flex-1 border border-ek-cream/25 bg-transparent px-3 text-15 text-ek-cream outline-none placeholder:text-ek-cream/45 focus:border-ek-gold-500"
        />
        <button
          type="submit"
          className="min-h-11 shrink-0 cursor-pointer border border-ek-gold-500 px-4 text-15 text-ek-gold-500 transition-colors hover:bg-ek-gold-500 hover:text-ek-green-950"
        >
          Sign up
        </button>
      </div>

      <p className="mt-3 max-w-xs text-15 text-ek-cream/60">
        We will email you once to check it is really you. Nothing is sent
        until you confirm.
      </p>
    </form>
  );
}
