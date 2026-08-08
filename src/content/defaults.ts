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

/* ------------------------------------------------------------------ */
/* What the editor shows                                               */

/**
 * The groups the editor lists, in the order it lists them.
 *
 * Ordered by how often copy actually changes: the homepage and the tracking
 * page are edited, navigation labels and the footer almost never are. A
 * grouping that mirrored the file tree would be alphabetical and would put
 * "footer" first.
 */
export const CONTENT_GROUPS = [
  {
    id: "home",
    title: "Home page",
    blurb: "The first screen. The heading is three separate fields so an edit cannot drop the line break or the gold word.",
    prefix: "home.",
  },
  {
    id: "track",
    title: "Track & sign in",
    blurb: "What someone reads when they are looking for an order they have already placed.",
    prefix: "track.",
  },
  {
    id: "nav",
    title: "Navigation",
    blurb: "Menu labels. Short ones — these sit in a single row on a phone.",
    prefix: "nav.",
  },
  {
    id: "footer",
    title: "Footer",
    blurb: "Every page carries this.",
    prefix: "footer.",
  },
  {
    id: "site",
    title: "Site-wide",
    blurb: "Used in more than one place.",
    prefix: "site.",
  },
] as const;

export type ContentGroupId = (typeof CONTENT_GROUPS)[number]["id"];

/**
 * A human label for each key, and a note where the string has a constraint
 * that is not obvious from reading it.
 *
 * Every key needs an entry: the editor is the only place this copy can be
 * changed, and a field labelled `home.hero.cta.primary` asks the owner to
 * read the code to find out what it is. `CONTENT_LABELS` is typed as a
 * total Record, so adding a key to CONTENT_DEFAULTS without labelling it is
 * a compile error rather than a mystery field on the page.
 */
export const CONTENT_LABELS: Record<
  ContentKey,
  { label: string; hint?: string }
> = {
  "site.tagline": {
    label: "Tagline",
    hint: "Sits under the wordmark.",
  },

  "nav.shop.label": { label: "Shop" },
  "nav.about.label": { label: "About" },
  "nav.blog.label": { label: "Journal" },
  "nav.faq.label": { label: "FAQ" },
  "nav.contact.label": { label: "Contact" },
  "nav.account.label": { label: "My account" },

  "home.hero.eyebrow": {
    label: "Eyebrow",
    hint: "The small line above the heading.",
  },
  "home.hero.heading.line1": {
    label: "Heading — first line",
  },
  "home.hero.heading.line2": {
    label: "Heading — second line, before the gold word",
  },
  "home.hero.heading.accent": {
    label: "Heading — the gold word",
    hint: "One or two words. It is set in gold and ends the sentence.",
  },
  "home.hero.body": {
    label: "Opening paragraph",
  },
  "home.hero.cta.primary": {
    label: "Button",
    hint: "A few words. It has to fit a phone.",
  },

  "footer.blurb": { label: "Footer paragraph" },
  "footer.shop.heading": { label: "Column heading — shop" },
  "footer.company.heading": { label: "Column heading — company" },
  "footer.help.heading": { label: "Column heading — help" },
  "footer.help.account": { label: "Link — my account" },
  "footer.help.track": { label: "Link — track your order" },
  "footer.help.wishlist": { label: "Link — saved items" },
  "footer.help.grievance": {
    label: "Link — grievance officer",
    hint: "The link is required by the Consumer Protection (E-Commerce) Rules. The wording can change; the link cannot go.",
  },
  "footer.legal.fssai": {
    label: "Licence line",
    hint: "Make no claim about health, disease or treatment here — FSSAI forbids it.",
  },

  "track.heading": { label: "Heading" },
  "track.eyebrow": { label: "Eyebrow" },
  "track.body.guest": {
    label: "Paragraph — looking up an order by reference",
  },
  "track.signin.heading": { label: "Sign-in heading" },
  "track.signin.body": { label: "Sign-in paragraph" },
  "track.signin.cta": { label: "Sign-in button" },
};

/**
 * The longest a value may be, per key.
 *
 * A ceiling rather than a design constraint: it stops a paste of an entire
 * document into a button label, and gives the editor a character count that
 * means something. Anything not listed gets DEFAULT_MAX_LENGTH.
 */
export const DEFAULT_MAX_LENGTH = 2000;

export const CONTENT_MAX_LENGTHS: Partial<Record<ContentKey, number>> = {
  "site.tagline": 60,
  "nav.shop.label": 24,
  "nav.about.label": 24,
  "nav.blog.label": 24,
  "nav.faq.label": 24,
  "nav.contact.label": 24,
  "nav.account.label": 24,
  "home.hero.eyebrow": 80,
  "home.hero.heading.line1": 60,
  "home.hero.heading.line2": 60,
  "home.hero.heading.accent": 24,
  "home.hero.cta.primary": 40,
  "footer.shop.heading": 30,
  "footer.company.heading": 30,
  "footer.help.heading": 30,
  "footer.help.account": 30,
  "footer.help.track": 30,
  "footer.help.wishlist": 30,
  "footer.help.grievance": 40,
  "footer.legal.fssai": 90,
  "track.heading": 80,
  "track.eyebrow": 40,
  "track.signin.heading": 80,
  "track.signin.cta": 40,
};

export function maxLengthFor(key: ContentKey): number {
  return CONTENT_MAX_LENGTHS[key] ?? DEFAULT_MAX_LENGTH;
}

/** The keys in one group, in the order they are declared above. */
export function keysInGroup(prefix: string): ContentKey[] {
  return CONTENT_KEYS.filter((key) => key.startsWith(prefix));
}
