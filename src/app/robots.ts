import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/cart",
        "/checkout",
        "/order/",
        "/admin",
        "/account",
      ],
    },
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
