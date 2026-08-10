import { appUrl } from "@/lib/env";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";

/**
 * JSON-LD builders. Keep every URL absolute — search engines resolve
 * these documents independently of the page they sit on.
 */

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${appUrl}/#organization`,
    name: SITE_NAME,
    url: appUrl,
    logo: `${appUrl}/brand/ekmool-logo-primary-2048.png`,
    description: SITE_DESCRIPTION,
    slogan: "Single Origin · India",
  };
}

/**
 * The catalogue as an ItemList, for the home page.
 *
 * URLs only — no name/price/availability inside the list. Google's own
 * guidance splits this two ways: a *summary* page links out and gives each
 * entry a position and a URL, while an *all-in-one* page repeats the full
 * Product markup. The home page is the first kind. Restating a price here
 * would create a second place for it to be wrong, and the day the two
 * disagree is the day the product page gets a merchant-listing warning.
 *
 * `name` is included because it is valid schema.org and useful to
 * consumers that are not Google; nothing depends on it.
 */
export function productItemListJsonLd(
  products: { slug: string; name: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${appUrl}/#catalogue`,
    name: `${SITE_NAME} — GI-tagged single-origin foods`,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: product.name,
      url: `${appUrl}/products/${product.slug}`,
    })),
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${appUrl}/#website`,
    name: SITE_NAME,
    url: appUrl,
    publisher: { "@id": `${appUrl}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${appUrl}/products?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}
