import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Required by the PostHog reverse proxy (API paths must keep their shape).
  skipTrailingSlashRedirect: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async rewrites() {
    // PostHog reverse proxy — survives ad-blockers. Inert until a key is set.
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
};

export default nextConfig;
