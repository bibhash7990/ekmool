import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        // The app's catalogue. Not secret — it is the same five products
        // that are indexed as pages — but a crawler spending its budget on
        // a JSON document that will never rank is budget not spent on
        // /products/[slug], which is what should.
        "/catalog/",
        "/cart",
        "/checkout",
        "/order/",
        "/orders/",
        "/track",
        "/admin",
        "/account",
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
