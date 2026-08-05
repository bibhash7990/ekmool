export const SITE_NAME = "Ekmool";
export const SITE_TAGLINE = "Single Origin · India";
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

export const NAV_LINKS = [
  { href: "/products", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Journal" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * Header-only. Kept out of NAV_LINKS because the footer renders that list
 * under "Company", and the account is not company information — it gets its
 * own footer entry under Help.
 *
 * Points at /account rather than /track: with a session that is the order
 * history, and without one the account layout redirects to /track anyway.
 */
export const ACCOUNT_LINK = { href: "/account", label: "Orders" } as const;

export const POLICY_LINKS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/shipping-policy", label: "Shipping Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
] as const;

/** Shipping rules (INR paise). Free above ₹499, else flat ₹49. */
export const FREE_SHIPPING_THRESHOLD_PAISE = 49900;
export const FLAT_SHIPPING_PAISE = 4900;
