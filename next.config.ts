import type { NextConfig } from "next";
import createMDX from "@next/mdx";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Content-Security-Policy.
 *
 * **Why there is no nonce.** The strict, textbook CSP is a per-request nonce
 * with `strict-dynamic`. Next supports it — but reading a per-request header
 * forces every page to be dynamic, and this site's whole load story is that
 * browsing is statically generated and never touches the database (see the
 * README). Trading that for a stronger script-src on a site whose only
 * third-party script is Razorpay's checkout is the wrong trade, so
 * `'unsafe-inline'` stays and the origin allowlist does the work: an
 * injected `<script src>` pointing anywhere but this origin or Razorpay is
 * still refused.
 *
 * The directives that are *not* weakened are the ones that matter most here:
 * `frame-ancestors` and `object-src` are absolute, and `form-action 'self'`
 * means a successful injection still cannot post a filled checkout form to
 * somebody else's server.
 *
 * PostHog and Sentry are absent from every directive on purpose. Both are
 * proxied through this origin — `/ingest` by a rewrite, `/monitoring` by
 * Sentry's tunnelRoute — so the browser never talks to them directly, which
 * is also what makes them survive ad-blockers.
 */
const CSP = [
  "default-src 'self'",
  // Razorpay's checkout.js and Turnstile's api.js. Inline is required
  // without a nonce; see above.
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://challenges.cloudflare.com",
  // Next injects inline style attributes for fonts and for the image
  // placeholder; there is no build in which this can be dropped.
  "style-src 'self' 'unsafe-inline'",
  // next/font self-hosts Google Fonts at build time — no remote font origin.
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "connect-src 'self' https://*.razorpay.com https://*.clerk.accounts.dev",
  // The payment modal, Turnstile's challenge, and Clerk's sign-in when it
  // is configured. Turnstile renders inside an iframe it owns.
  "frame-src 'self' https://*.razorpay.com https://challenges.cloudflare.com https://*.clerk.accounts.dev",
  // Both already fall back to default-src, so both are already 'self'.
  // Stated anyway: a future tightening of default-src would otherwise stop
  // the service worker registering and the manifest loading, and that
  // failure mode — the site works, it just quietly stops being installable
  // and stops working offline — is one nobody would notice for months.
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nothing may frame this site. X-Frame-Options below says the same thing
  // for anything too old to read this directive.
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  {
    // Two years, and only honoured over HTTPS — browsers ignore it on plain
    // HTTP, so it is safe to send in development too.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // Full URL to ourselves, origin only to anyone else. An order page URL
    // contains the ULID that *is* the credential for that order, so it must
    // never travel in a Referer to a third party.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // A shop needs none of these. Denying them is one less thing a
    // compromised script could ask the browser for.
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Required by the PostHog reverse proxy (API paths must keep their shape).
  skipTrailingSlashRedirect: true,
  pageExtensions: ["ts", "tsx", "mdx"],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
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
  //
  // Not silent in CI. `silent: true` swallows Sentry's own build output,
  // and on a hosted build that is the difference between a diagnosable
  // failure and a log that simply stops after the Turbopack banner with
  // no error at all. Locally it stays quiet, because there the build
  // works and the noise is not worth it.
  silent: !process.env.CI,
  widenClientFileUpload: false,
  // No `disableLogger` here: it is deprecated in favour of
  // webpack.treeshake.removeDebugLogging, which Turbopack does not support.
  // Setting either one would only emit a warning on every build.
  // Route Sentry's own ingestion through our origin as well, so
  // ad-blockers cannot suppress error reports.
  tunnelRoute: "/monitoring",
});
