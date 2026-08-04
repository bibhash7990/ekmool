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
