// Type-only: this module is imported by client components, and a type
// import is erased at compile time, so nothing from the content layer is
// bundled for the browser.
import type { ContentKey } from "@/content/defaults";

export const SITE_NAME = "Ekmool";
// The tagline moved to src/content/defaults.ts as "site.tagline" so the
// owner can change it without a deploy. Deleted rather than left here
// pointing at the same words: two sources for one string drift, and the
// stale one is the one somebody imports next.
export const SITE_DESCRIPTION =
  "GI-tagged, single-origin Indian foods — Kandhamal & Lakadong turmeric, Mithila makhana, Guntur & Byadagi chilli — traced to one soil, one root.";

/** Canonical product slugs — permanent URL identifiers. */
export const PRODUCT_SLUGS = [
  "kandhamal-turmeric-powder",
  "lakadong-turmeric-powder",
  "mithila-makhana",
  "guntur-chilli-powder",
  "byadagi-chilli-powder",
] as const;

export type ProductSlug = (typeof PRODUCT_SLUGS)[number];

/**
 * `label` is the wording as shipped; `key` is where the editable version
 * lives. Both, rather than the key alone, because these are imported by a
 * client component (MobileNav) that cannot read the content map — it
 * receives resolved labels as props from the server Header, and the label
 * here is what renders anywhere that has no map to hand.
 *
 * Keeping the key beside the href is what stops the two drifting: a link
 * added here without a key is a compile error, not a label that silently
 * ignores the admin.
 */
export const NAV_LINKS = [
  { href: "/products", label: "Shop", key: "nav.shop.label" },
  { href: "/about", label: "About", key: "nav.about.label" },
  { href: "/blog", label: "Journal", key: "nav.blog.label" },
  { href: "/faq", label: "FAQ", key: "nav.faq.label" },
  { href: "/contact", label: "Contact", key: "nav.contact.label" },
] as const satisfies readonly {
  href: string;
  label: string;
  key: ContentKey;
}[];

/**
 * Header-only. Kept out of NAV_LINKS because the footer renders that list
 * under "Company", and the account is not company information — it gets its
 * own footer entry under Help.
 *
 * Points at /account rather than /track: with a session that is the order
 * history, and without one the account layout redirects to /track anyway.
 *
 * Labelled "My account", not "Orders". "Orders" described the destination
 * accurately — it lands on the order list — but a shopper scanning a
 * header for somewhere to manage their details does not read "Orders" as
 * that place, and reported the account section as missing when it was
 * present in the nav the whole time. The link now names the section rather
 * than its first page.
 */
export const ACCOUNT_LINK = {
  href: "/account",
  label: "My account",
  key: "nav.account.label",
} as const satisfies { href: string; label: string; key: ContentKey };

export const POLICY_LINKS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/shipping-policy", label: "Shipping Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
] as const;

/**
 * Shipping rules (INR paise). Free above ₹499, else flat ₹49.
 *
 * The values moved to `@ekmool/core/shipping` when the app needed them, and
 * are re-exported here rather than relocated in six call sites. Two clients
 * quoting different delivery charges for the same basket is a lie the
 * customer cannot resolve, and a shared constant is the only thing that
 * actually prevents it — a comment asking the next person to update both
 * would not have.
 */
export {
  FREE_SHIPPING_THRESHOLD_PAISE,
  FLAT_SHIPPING_PAISE,
} from "@ekmool/core/shipping";
