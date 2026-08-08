/**
 * Every string a visitor can read, with the value it has today.
 *
 * This is the source of truth, not a fallback. `site_content` in MySQL is
 * an override layer on top of it: a key with no row renders what is here,
 * and so does a key whose row cannot be read because the database is
 * stopped. That is what keeps rule 8 true — `/`, `/products`, `/blog/*`
 * and the policy pages serve with MySQL down, which `npm run chaos`
 * asserts — while still letting the admin change copy without a deploy.
 *
 * Keys are dotted and namespaced by page. Adding one here is what makes it
 * editable; a string typed straight into JSX is invisible to the admin and
 * can only be changed by a developer, which is what rule 13 forbids.
 *
 * WHAT DOES NOT BELONG HERE
 *
 * Structural markup. The homepage h1 carries a <br /> and a gold <span>;
 * those are design, not copy, and putting them in an editable string would
 * let a typo in the admin break the layout. Such headings are split into
 * their text parts, and the markup stays in the component.
 *
 * Legally fixed strings. The "pro-forma — not a tax invoice" heading and
 * the GST breakdown labels are representations to a customer's accountant.
 * They stay in code where changing them is a reviewed act.
 *
 * Error messages tied to code paths, aria-labels, and anything inside
 * /admin — an admin who breaks the admin's own copy has no way back in.
 */

export const CONTENT_DEFAULTS = {
  /* ---------- Site-wide ---------- */
  "site.tagline": "Single Origin · India",

  /* ---------- Navigation ---------- */
  "nav.shop.label": "Shop",
  "nav.about.label": "About",
  "nav.blog.label": "Journal",
  "nav.faq.label": "FAQ",
  "nav.contact.label": "Contact",
  "nav.account.label": "My account",

  /* ---------- Home ---------- */
  "home.hero.eyebrow": "Single Origin · GI-Tagged · India",
  // Split because the rendered heading is "The root runs deeper" / <br /> /
  // "than the " + <span class=gold>badge</span> + ".". Keeping the parts
  // separate means an edit cannot drop the line break or the gold word.
  "home.hero.heading.line1": "The root runs deeper",
  "home.hero.heading.line2": "than the",
  "home.hero.heading.accent": "badge",
  "home.hero.body":
    "Five foods, five districts, one standard. We buy where the Geographical Indication was earned — Kandhamal, Lakadong, Mithila, Guntur, Byadagi — and mill in small batches so what reaches you still smells of the field it came from.",
  "home.hero.cta.primary": "Shop single origin",

  /* ---------- Footer ---------- */
  "footer.blurb":
    "One root, one soil. Every pack is traced to the district that earned its GI tag.",
  "footer.shop.heading": "Shop",
  "footer.company.heading": "Company",
  "footer.help.heading": "Help",
  "footer.help.account": "My account",
  "footer.help.track": "Track your order",
  "footer.help.wishlist": "Saved items",
  "footer.help.grievance": "Grievance officer",
  "footer.legal.fssai": "FSSAI licensed · Made in India",

  /* ---------- Track / sign in ---------- */
  "track.heading": "Find your order.",
  "track.eyebrow": "Your orders",
  "track.body.guest":
    "There is no account to sign into and no password to remember. Give us the reference from your confirmation and the email you ordered with, and everything you have bought from us is there.",
  "track.signin.heading": "Or sign in with your email",
  "track.signin.body":
    "If you have signed in here before, use the same email address you ordered with and your orders will be waiting — no reference needed.",
  "track.signin.cta": "Sign in with email",
} as const;

/**
 * Every valid key, as a union. A `t()` call with a key that is not here is
 * a compile error rather than a blank space on a live page — which is the
 * whole reason the defaults are a literal object and not a plain record.
 */
export type ContentKey = keyof typeof CONTENT_DEFAULTS;

/** Every key, for the admin editor and the orphan report. */
export const CONTENT_KEYS = Object.keys(CONTENT_DEFAULTS) as ContentKey[];
