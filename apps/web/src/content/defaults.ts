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

  /* ---------- Refund policy ---------- */
  //
  // Section BODIES are markdown; headings and standfirsts are plain text.
  // See MARKDOWN_KEYS below and src/lib/markdown.ts for what markdown is
  // allowed to produce — lists, bold, italic and links, and nothing that
  // can alter the page's layout or heading structure.
  //
  // The date is a key rather than a computed value on purpose. "Last
  // updated" on a legal page states when the TERMS changed, not when the
  // file was touched; deriving it from a deploy would make every unrelated
  // release claim the policy had been revised.
  "policy.refund.updated": "4 August 2026",
  "policy.refund.standfirst":
    "We sell food, which limits what we can take back. Here is exactly where the line sits and what we do on either side of it.",

  "policy.refund.short.heading": "The short version",
  "policy.refund.short.body": `- Damaged, wrong or missing items — full replacement or refund, no return shipping, no argument. Tell us within 48 hours.
- Sealed, unopened packs — returnable within 7 days of delivery.
- Opened food packs — cannot be returned, because food-safety rules prevent us reselling them.`,

  "policy.refund.damaged.heading": "Damaged, wrong or missing items",
  "policy.refund.damaged.body": `Write to us within 48 hours of delivery with your order reference and a photograph of the parcel and its contents. We will send a replacement or refund the full amount, including any shipping you paid, and you will not be asked to ship anything back.

This is the one situation where we do not want a debate. If a parcel arrived in a state you would not have accepted in a shop, that is our problem to fix.`,

  "policy.refund.sealed.heading": "Sealed, unopened packs",
  "policy.refund.sealed.body": `If you have changed your mind and the pouch is still sealed, you may return it within 7 days of delivery. The pack must be unopened, with its seal and labels intact, and in a condition that lets us confirm it was never in use.

Return shipping for change-of-mind returns is at your cost, and the original shipping charge is not refunded. Once we receive and inspect the pack we refund the product value.`,

  "policy.refund.opened.heading": "Opened packs — why we cannot accept them",
  "policy.refund.opened.body": `Once a food pouch is opened we cannot verify how it was stored, and under Indian food-safety rules we cannot resell it. Accepting opened returns would mean either destroying the stock at your expense or reselling food we cannot vouch for. Neither is acceptable, so we do not accept opened returns for change of mind.

That said: if something tasted wrong to you — musty, flat, unlike the description — write to us anyway. That is a sourcing signal we want to hear about, and we will usually make it right even though the policy does not require us to.`,

  "policy.refund.cancellations.heading": "Cancellations",
  "policy.refund.cancellations.body": `You can cancel any order that has not yet shipped, for a full refund. Write to us from the [contact page](/contact) with your order reference as soon as you can — we pack within one working day, so the window is short.

Once a parcel has been handed to the courier we cannot recall it, but you may refuse delivery. For a Cash on Delivery order that costs you nothing. For a prepaid order we refund the product value once the parcel returns to us.`,

  "policy.refund.how.heading": "How refunds are paid",
  "policy.refund.how.body": `- Prepaid orders — refunded to the original payment method through Razorpay. Banks typically credit this within 5 to 7 working days of us initiating it.
- Cash on Delivery orders — refunded by bank transfer or UPI to an account you nominate, usually within 3 to 5 working days of us receiving the details.

We initiate every approved refund within 2 working days. The time after that is your bank's, not ours, and we will share the reference number so you can chase it if needed.`,

  "policy.refund.excluded.heading": "What is not covered",
  "policy.refund.excluded.body": `- Natural variation in colour, aroma or intensity between harvest lots. We do not colour-correct or standardise our spices, so some variation across a season is expected and described on each product page.
- Products damaged after delivery by storage in heat, damp or direct sunlight.
- Claims made more than 7 days after delivery, except where the product was defective on arrival and reported within 48 hours.`,

  "policy.refund.rights.heading": "Consumer rights",
  "policy.refund.rights.body": `Nothing in this policy limits your rights under the Consumer Protection Act, 2019 or the Consumer Protection (E-Commerce) Rules, 2020. If you believe we have handled something unfairly, say so directly — we would rather resolve it with you than have you escalate it.`,

  /* ---------- Shipping policy ---------- */
  "policy.shipping.updated": "4 August 2026",
  "policy.shipping.standfirst":
    "Where we ship, what it costs, how long it takes, and what happens when something goes wrong in transit.",

  "policy.shipping.where.heading": "Where we ship",
  "policy.shipping.where.body": `We ship to all serviceable PIN codes across India. We do not currently ship internationally. If our courier partners cannot reach your PIN code we will contact you and refund the order in full rather than leave it pending.`,

  "policy.shipping.charges.heading": "Charges",
  "policy.shipping.charges.body": `- Orders of ₹499 and above — free shipping.
- Orders below ₹499 — flat ₹49, anywhere in India, regardless of distance.
- Cash on Delivery carries no extra fee. All prices shown on the site already include GST.`,

  "policy.shipping.times.heading": "Dispatch and delivery times",
  // Split around the zone table, which is NOT editable: it renders from
  // @ekmool/core/serviceability, the same table the PIN code checker on a
  // product page reads. A policy and a widget quoting different numbers is
  // how a shop ends up with a promise it did not know it had made.
  "policy.shipping.times.before": `Orders are packed and handed to the courier within one working day of confirmation. Orders placed on Sunday or a public holiday are packed the next working day.

Typical transit time after dispatch:`,
  "policy.shipping.times.after": `These are courier estimates, not guarantees. Weather, festival season, strikes and regional restrictions can extend them, and we will tell you if we know a delay is coming. Where a PIN code range covers both plains and hills we quote the slower band, so an estimate is more likely to be beaten than missed.`,

  "policy.shipping.tracking.heading": "Tracking",
  "policy.shipping.tracking.body": `You receive a tracking link by email the moment your parcel is handed over. That link is more current than we are, because it reads the courier's own system directly. If tracking has not moved for more than three working days, write to us and we will open a query with the courier.`,

  "policy.shipping.packaging.heading": "Packaging",
  "policy.shipping.packaging.body": `Spices are packed in sealed, food-grade pouches inside a rigid outer carton, with the batch and packing date printed on the pouch. We use paper tape and paper-based void fill rather than plastic wherever the parcel weight allows it.`,

  "policy.shipping.failed.heading": "Failed and undelivered parcels",
  "policy.shipping.failed.body": `Couriers usually attempt delivery up to three times. Please make sure the phone number on your order is one you will answer, as most failed deliveries in India are failed phone calls rather than failed addresses.

If a parcel returns to us undelivered we will contact you to arrange a re-dispatch. For prepaid orders you may instead request a refund of the order value; the original shipping charge is not refunded on a second attempt caused by an incorrect address or an unreachable number.`,

  "policy.shipping.damage.heading": "Damage in transit",
  "policy.shipping.damage.body": `If your parcel arrives damaged, or a pouch has burst, tell us within 48 hours of delivery with a photograph and we will replace or refund it in full. You will not be asked to ship it back. See the [refund policy](/refund-policy) for how and when the money reaches you.`,

  "policy.shipping.questions.heading": "Questions",
  "policy.shipping.questions.body": `Anything not covered here — write to us from the [contact page](/contact) with your order reference.`,

  /* ---------- Privacy policy ---------- */
  "policy.privacy.updated": "4 August 2026",
  "policy.privacy.standfirst":
    "What we collect, why we need it, who else sees it, and how to get it deleted. Written to be read rather than skimmed past.",

  "policy.privacy.collect.heading": "What we collect",
  "policy.privacy.collect.body": `When you place an order we collect:

- Your name, email address and mobile number
- The delivery address you give us, including PIN code
- What you ordered, and the amount paid
- Any note you add to the order

We ask for this because we cannot deliver a parcel or send you a receipt without it. There is no optional profiling data on our checkout form.

Two other things you can choose to give us:

- **Saved items.** The heart on a product keeps it in your own browser. It is copied to your account only once you have looked up an order, and only so the list survives a new phone.
- **A back-in-stock request.** If you ask to be told when a sold-out pack returns, we hold your email address against that pack until we have written to you once. It is not a mailing list and it does not become one.

Recently viewed products are kept entirely in your own browser. That list is never sent to us, so we cannot see it, store it or lose it.`,

  "policy.privacy.notcollect.heading": "What we deliberately do not collect",
  "policy.privacy.notcollect.body": `- **Card details.** Online payments are handled entirely by Razorpay. Card numbers, CVVs and UPI credentials are entered on their PCI-DSS compliant systems and never reach our servers. We store only a payment reference.
- **Passwords.** Checkout is guest-first — there is no customer account, so there is no password for us to store or leak.
- **Session recordings.** We do not record your screen, your mouse movements or your keystrokes.
- **Advertising trackers.** There are no third-party advertising or social pixels on this site.`,

  "policy.privacy.analytics.heading": "Analytics and error monitoring",
  "policy.privacy.analytics.body": `We use a privacy-conscious product analytics tool to understand which pages are used and where checkout breaks down, and an error monitoring service to be told when something crashes. Both are loaded only after the page is usable, and neither is given your name, address or contact details.

Error reports may include a route and an order reference so we can find the problem. They do not include your personal details.`,

  "policy.privacy.sharing.heading": "Who else sees your data",
  "policy.privacy.sharing.body": `Only the parties who need it to complete your order, and only the part they need:

- **Courier partners** — name, address and phone number, so they can deliver the parcel.
- **Razorpay** — payment details you enter directly with them, for prepaid orders.
- **Our email provider** — your email address and order contents, to send your receipt and shipping updates.

We do not sell your data, rent it, or share it for anyone else's marketing. We will disclose it if a court or a law lawfully requires us to, and not otherwise.`,

  "policy.privacy.retention.heading": "How long we keep it",
  "policy.privacy.retention.body": `Order records are kept for eight years, because Indian tax and accounting rules require us to retain sales records for that period. Email delivery logs are kept for two years. If you ask us to erase your data we will remove everything not covered by that legal retention duty, and restrict the rest to accounting use only.`,

  "policy.privacy.cookies.heading": "Cookies",
  "policy.privacy.cookies.body": `We use no advertising cookies and show no cookie banner, because we do not set the kind of cookies that require consent. Your cart is stored in your own browser's local storage rather than on our servers — clearing your browser data clears your cart, and we never see it until you place an order.`,

  "policy.privacy.rights.heading": "Your rights",
  "policy.privacy.rights.body": `You can ask us for a copy of the data we hold about you, ask us to correct it, or ask us to erase it. Write from the [contact page](/contact) using the email address on the order and we will respond within 30 days. We will not ask you to justify the request.`,

  "policy.privacy.security.heading": "Security",
  "policy.privacy.security.body": `The site is served over HTTPS. Order data is stored in an access controlled database, queries are parameterised, and administrative access is restricted to named accounts with multi-factor authentication. No system is perfect; if we ever suffer a breach affecting your data we will tell you what happened and what we are doing about it, promptly and in plain language.`,

  "policy.privacy.changes.heading": "Changes and contact",
  "policy.privacy.changes.body": `If this policy changes materially we will update the date at the top of this page and describe what changed. For any privacy question, write to us from the [contact page](/contact).`,

  /* ---------- Terms of service ---------- */
  "policy.terms.updated": "4 August 2026",
  "policy.terms.standfirst":
    "The agreement between you and Ekmool when you place an order. Short, and written in the same voice as everything else on this site.",

  "policy.terms.parties.heading": "Who these terms are between",
  "policy.terms.parties.body": `These terms apply between you and Ekmool, a direct-to-consumer food business operating in India, whenever you use this website or place an order through it. By placing an order you accept them.

You must be at least 18 years old, or have the consent of a parent or guardian, to place an order.`,

  "policy.terms.formation.heading": "How an order is formed",
  "policy.terms.formation.body": `Adding items to your cart or reaching the checkout page does not create a contract. A contract is formed when we confirm your order — for Cash on Delivery, at the moment you place it; for prepaid orders, when payment is confirmed.

We may decline or cancel an order before dispatch if an item is out of stock, if a price was listed in error, if the delivery address is not serviceable, or if we reasonably suspect fraud. If we cancel a prepaid order we refund it in full.`,

  "policy.terms.pricing.heading": "Pricing and stock",
  "policy.terms.pricing.body": `All prices are in Indian Rupees and include GST. Shipping is shown separately at checkout and is free above ₹499.

Product pages are served from a cache that refreshes hourly, so a price or stock figure can briefly be out of date. The authoritative check happens when you place the order: if an item has sold out in the meantime the order is rejected with a clear message rather than part-fulfilled, and nothing is charged. If a price shown was materially wrong we will contact you before dispatch and give you the choice to confirm at the correct price or cancel.`,

  "policy.terms.descriptions.heading": "Product descriptions",
  "policy.terms.descriptions.body": `We describe origin, processing and composition as accurately as we can, and publish figures such as curcumin content as ranges because agricultural products vary between harvests. Colour, aroma and intensity will vary a little between lots because we do not colour-correct or standardise our spices.

Nothing on this site is medical advice, and we make no claim that any product diagnoses, treats, cures or prevents any condition. If you have a food allergy, are pregnant, or take medication, consult a qualified professional before making significant changes to your diet.

Photographs are illustrative. The pack you receive may differ slightly in appearance from the images shown.`,

  "policy.terms.delivery.heading": "Delivery, returns and refunds",
  "policy.terms.delivery.body": `Delivery timelines and charges are set out in our [shipping policy](/shipping-policy). Returns, replacements and refunds — including the food-safety limits on returning opened packs — are set out in our [refund policy](/refund-policy). Both form part of these terms.`,

  "policy.terms.responsibilities.heading": "Your responsibilities",
  "policy.terms.responsibilities.body": `- Give us a delivery address and phone number that are accurate and reachable. Most failed deliveries in India are unanswered phone calls.
- Store food products as described on the pack once they reach you.
- Do not resell our products commercially without a written wholesale agreement.`,

  "policy.terms.ip.heading": "Intellectual property",
  "policy.terms.ip.body": `The Ekmool name, mark, packaging design, photography and written content on this site belong to us. You may not reproduce them commercially without permission. The Geographical Indications we reference belong to their registered producer collectives, not to us — we are a buyer operating inside those boundaries, not a rights holder.`,

  "policy.terms.liability.heading": "Liability",
  "policy.terms.liability.body": `Our liability for any order is limited to the amount you paid for it, together with any refund or replacement due under our refund policy. We are not liable for indirect or consequential loss.

Nothing here excludes liability that cannot lawfully be excluded, including liability for death or personal injury caused by negligence, for fraud, or under the Consumer Protection Act, 2019.`,

  "policy.terms.availability.heading": "Availability",
  "policy.terms.availability.body": `We aim to keep the site available continuously but do not guarantee it. Maintenance, third-party outages and genuine emergencies happen. If checkout is unavailable when you try, your cart is stored in your own browser and will still be there when the site returns.`,

  "policy.terms.law.heading": "Governing law",
  "policy.terms.law.body": `These terms are governed by the laws of India, and the courts of India have exclusive jurisdiction over any dispute arising from them. Before any of that, please just write to us from the [contact page](/contact) — we would far rather fix the problem.`,
} as const;

/**
 * Every valid key, as a union. A `t()` call with a key that is not here is
 * a compile error rather than a blank space on a live page — which is the
 * whole reason the defaults are a literal object and not a plain record.
 */
export type ContentKey = keyof typeof CONTENT_DEFAULTS;

/** Every key, for the admin editor and the orphan report. */
export const CONTENT_KEYS = Object.keys(CONTENT_DEFAULTS) as ContentKey[];

/**
 * Keys whose value is markdown rather than plain text.
 *
 * Derived from the key name, not listed by hand. A hand-written list is a
 * second source of truth that has to be updated in step with the defaults
 * above, and the failure mode of forgetting is silent: the page would
 * render `- item` and `**bold**` as literal characters, which reads as a
 * typo in the copy rather than a missing entry in a list.
 *
 * The convention is the suffix. `.body`, `.before` and `.after` are prose;
 * `.heading`, `.standfirst`, `.label`, `.cta` and `.updated` are single
 * strings that must not sprout lists or links.
 */
const MARKDOWN_SUFFIXES = [".body", ".before", ".after"];

export function isMarkdownKey(key: ContentKey): boolean {
  return MARKDOWN_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

export const MARKDOWN_KEYS = CONTENT_KEYS.filter(isMarkdownKey);

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
    id: "policy-refund",
    title: "Refund policy",
    blurb:
      "A legal page. What you write here is a representation to a customer, and the Consumer Protection Act applies to it. Every change is recorded against your name, and Revert puts the original wording back.",
    prefix: "policy.refund.",
  },
  {
    id: "policy-shipping",
    title: "Shipping policy",
    blurb:
      "As above. The delivery-time table inside section 3 is generated from the same data as the PIN code checker and is not editable here — that is deliberate, so the policy and the checker can never quote different numbers.",
    prefix: "policy.shipping.",
  },
  {
    id: "policy-privacy",
    title: "Privacy policy",
    blurb:
      "A legal page, and a factual one: it describes what the site actually does with data. A sentence here that no longer matches the code is not out of date, it is wrong.",
    prefix: "policy.privacy.",
  },
  {
    id: "policy-terms",
    title: "Terms of service",
    blurb:
      "A legal page. The FSSAI paragraph forbidding health claims, and the paragraph preserving rights that cannot lawfully be excluded, are there because they have to be.",
    prefix: "policy.terms.",
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

  /* ---------- Refund policy ---------- */
  "policy.refund.updated": {
    label: "Last updated",
    hint: "The date the TERMS last changed — not the date you last edited a typo.",
  },
  "policy.refund.standfirst": { label: "Opening paragraph" },
  "policy.refund.short.heading": { label: "Section 1 — heading" },
  "policy.refund.short.body": { label: "Section 1 — text" },
  "policy.refund.damaged.heading": { label: "Section 2 — heading" },
  "policy.refund.damaged.body": { label: "Section 2 — text" },
  "policy.refund.sealed.heading": { label: "Section 3 — heading" },
  "policy.refund.sealed.body": { label: "Section 3 — text" },
  "policy.refund.opened.heading": { label: "Section 4 — heading" },
  "policy.refund.opened.body": {
    label: "Section 4 — text",
    hint: "The food-safety reasoning. Changing this changes what you have promised a customer.",
  },
  "policy.refund.cancellations.heading": { label: "Section 5 — heading" },
  "policy.refund.cancellations.body": { label: "Section 5 — text" },
  "policy.refund.how.heading": { label: "Section 6 — heading" },
  "policy.refund.how.body": {
    label: "Section 6 — text",
    hint: "These timescales are a commitment. Do not shorten them past what you can actually do.",
  },
  "policy.refund.excluded.heading": { label: "Section 7 — heading" },
  "policy.refund.excluded.body": { label: "Section 7 — text" },
  "policy.refund.rights.heading": { label: "Section 8 — heading" },
  "policy.refund.rights.body": {
    label: "Section 8 — text",
    hint: "The Consumer Protection Act reference is required. Reword it if you like, but do not remove it.",
  },

  /* ---------- Shipping policy ---------- */
  "policy.shipping.updated": {
    label: "Last updated",
    hint: "The date the TERMS last changed — not the date you last edited a typo.",
  },
  "policy.shipping.standfirst": { label: "Opening paragraph" },
  "policy.shipping.where.heading": { label: "Section 1 — heading" },
  "policy.shipping.where.body": { label: "Section 1 — text" },
  "policy.shipping.charges.heading": { label: "Section 2 — heading" },
  "policy.shipping.charges.body": {
    label: "Section 2 — text",
    hint: "The ₹499 threshold and ₹49 charge are what checkout actually charges. If you change one, change the other in the code too — this text does not drive the price.",
  },
  "policy.shipping.times.heading": { label: "Section 3 — heading" },
  "policy.shipping.times.before": {
    label: "Section 3 — text above the delivery table",
    hint: "The table of regions and days is not editable: it is generated from the same data as the PIN code checker, so the two can never disagree.",
  },
  "policy.shipping.times.after": {
    label: "Section 3 — text below the delivery table",
  },
  "policy.shipping.tracking.heading": { label: "Section 4 — heading" },
  "policy.shipping.tracking.body": { label: "Section 4 — text" },
  "policy.shipping.packaging.heading": { label: "Section 5 — heading" },
  "policy.shipping.packaging.body": { label: "Section 5 — text" },
  "policy.shipping.failed.heading": { label: "Section 6 — heading" },
  "policy.shipping.failed.body": { label: "Section 6 — text" },
  "policy.shipping.damage.heading": { label: "Section 7 — heading" },
  "policy.shipping.damage.body": { label: "Section 7 — text" },
  "policy.shipping.questions.heading": { label: "Section 8 — heading" },
  "policy.shipping.questions.body": { label: "Section 8 — text" },

  /* ---------- Privacy policy ---------- */
  "policy.privacy.updated": {
    label: "Last updated",
    hint: "The date the TERMS last changed — not the date you last edited a typo.",
  },
  "policy.privacy.standfirst": { label: "Opening paragraph" },
  "policy.privacy.collect.heading": { label: "Section 1 — heading" },
  "policy.privacy.collect.body": {
    label: "Section 1 — text",
    hint: "This must describe what the site actually collects. If it lists something we do not collect, or omits something we do, the page is inaccurate rather than merely out of date.",
  },
  "policy.privacy.notcollect.heading": { label: "Section 2 — heading" },
  "policy.privacy.notcollect.body": {
    label: "Section 2 — text",
    hint: "Each line here is a promise that something is NOT happening. Do not add one without checking it is true.",
  },
  "policy.privacy.analytics.heading": { label: "Section 3 — heading" },
  "policy.privacy.analytics.body": { label: "Section 3 — text" },
  "policy.privacy.sharing.heading": { label: "Section 4 — heading" },
  "policy.privacy.sharing.body": { label: "Section 4 — text" },
  "policy.privacy.retention.heading": { label: "Section 5 — heading" },
  "policy.privacy.retention.body": {
    label: "Section 5 — text",
    hint: "The eight-year figure comes from Indian tax and accounting rules, not from preference.",
  },
  "policy.privacy.cookies.heading": { label: "Section 6 — heading" },
  "policy.privacy.cookies.body": {
    label: "Section 6 — text",
    hint: "This says no cookie banner is shown because no consent-requiring cookies are set. If that ever changes, this text is not what makes it lawful — the code is.",
  },
  "policy.privacy.rights.heading": { label: "Section 7 — heading" },
  "policy.privacy.rights.body": {
    label: "Section 7 — text",
    hint: "The 30-day response commitment is a commitment.",
  },
  "policy.privacy.security.heading": { label: "Section 8 — heading" },
  "policy.privacy.security.body": { label: "Section 8 — text" },
  "policy.privacy.changes.heading": { label: "Section 9 — heading" },
  "policy.privacy.changes.body": { label: "Section 9 — text" },

  /* ---------- Terms of service ---------- */
  "policy.terms.updated": {
    label: "Last updated",
    hint: "The date the TERMS last changed — not the date you last edited a typo.",
  },
  "policy.terms.standfirst": { label: "Opening paragraph" },
  "policy.terms.parties.heading": { label: "Section 1 — heading" },
  "policy.terms.parties.body": { label: "Section 1 — text" },
  "policy.terms.formation.heading": { label: "Section 2 — heading" },
  "policy.terms.formation.body": {
    label: "Section 2 — text",
    hint: "When a contract is formed, and on what grounds an order may be declined. This is the section a dispute turns on.",
  },
  "policy.terms.pricing.heading": { label: "Section 3 — heading" },
  "policy.terms.pricing.body": {
    label: "Section 3 — text",
    hint: "The ₹499 free-shipping threshold must match what checkout charges. This text does not set the price.",
  },
  "policy.terms.descriptions.heading": { label: "Section 4 — heading" },
  "policy.terms.descriptions.body": {
    label: "Section 4 — text",
    hint: "The 'no medical claim' paragraph is required by FSSAI. Never add a claim that a product treats, cures or prevents anything.",
  },
  "policy.terms.delivery.heading": { label: "Section 5 — heading" },
  "policy.terms.delivery.body": { label: "Section 5 — text" },
  "policy.terms.responsibilities.heading": { label: "Section 6 — heading" },
  "policy.terms.responsibilities.body": { label: "Section 6 — text" },
  "policy.terms.ip.heading": { label: "Section 7 — heading" },
  "policy.terms.ip.body": {
    label: "Section 7 — text",
    hint: "The GI tags belong to their producer collectives. Do not reword this into a claim that we own them.",
  },
  "policy.terms.liability.heading": { label: "Section 8 — heading" },
  "policy.terms.liability.body": {
    label: "Section 8 — text",
    hint: "The second paragraph preserves rights that cannot lawfully be excluded. Removing it does not remove the liability, it just makes the page misleading.",
  },
  "policy.terms.availability.heading": { label: "Section 9 — heading" },
  "policy.terms.availability.body": { label: "Section 9 — text" },
  "policy.terms.law.heading": { label: "Section 10 — heading" },
  "policy.terms.law.body": { label: "Section 10 — text" },
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

/**
 * Policy fields, by shape rather than one entry each.
 *
 * Forty hand-written numbers would be forty chances to typo one, and the
 * shapes are genuinely uniform: a section heading is a few words, a
 * standfirst is a sentence or two, a body is prose that can legitimately
 * run long. The suffix already tells you which.
 */
function policyLimit(key: ContentKey): number | undefined {
  if (!key.startsWith("policy.")) return undefined;
  if (key.endsWith(".updated")) return 40;
  if (key.endsWith(".heading")) return 80;
  if (key.endsWith(".standfirst")) return 400;
  // Bodies: generous, because a section that genuinely needs 3,000
  // characters should not be split into two just to fit a limit. The cap
  // exists to stop a paste of an entire document, not to shape the copy.
  return 6000;
}

export function maxLengthFor(key: ContentKey): number {
  return CONTENT_MAX_LENGTHS[key] ?? policyLimit(key) ?? DEFAULT_MAX_LENGTH;
}

/** The keys in one group, in the order they are declared above. */
export function keysInGroup(prefix: string): ContentKey[] {
  return CONTENT_KEYS.filter((key) => key.startsWith(prefix));
}
