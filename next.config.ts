import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // Required by the PostHog reverse proxy (API paths must keep their shape).
  skipTrailingSlashRedirect: true,
  pageExtensions: ["ts", "tsx", "mdx"],
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

const withMDX = createMDX({
  options: {
    // Turbopack cannot serialise plugin functions across the Rust
    // boundary — plugins must be named as strings.
    remarkPlugins: [["remark-gfm"]],
    rehypePlugins: [],
  },
});

export default withSentryConfig(withMDX(nextConfig), {
  // Source-map upload is skipped without an auth token; the build still
  // succeeds, so a fresh clone with no Sentry account works unchanged.
  silent: true,
  widenClientFileUpload: false,
  // No `disableLogger` here: it is deprecated in favour of
  // webpack.treeshake.removeDebugLogging, which Turbopack does not support.
  // Setting either one would only emit a warning on every build.
  // Route Sentry's own ingestion through our origin as well, so
  // ad-blockers cannot suppress error reports.
  tunnelRoute: "/monitoring",
});
