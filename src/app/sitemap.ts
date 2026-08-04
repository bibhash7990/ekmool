import type { MetadataRoute } from "next";
import { getCatalog } from "@/db/queries/products";
import { appUrl } from "@/lib/env";
import { BLOG_POSTS } from "@/lib/blog-registry";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${appUrl}`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${appUrl}/products`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${appUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${appUrl}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${appUrl}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${appUrl}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${appUrl}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${appUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${appUrl}/shipping-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${appUrl}/refund-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
  ];

  const products = await getCatalog();
  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${appUrl}/products/${product.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${appUrl}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes, ...blogRoutes];
}
