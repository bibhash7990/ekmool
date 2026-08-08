import type { Metadata, Viewport } from "next";
import { Marcellus, Figtree } from "next/font/google";
import "./globals.css";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AnalyticsLoader } from "@/components/analytics/AnalyticsLoader";
import { VercelAnalytics } from "@/components/analytics/VercelAnalytics";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { JsonLd } from "@/components/seo/JsonLd";
import { StoreProvider } from "@/store/StoreProvider";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/seo/jsonld";
import { appUrl } from "@/lib/env";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";

/* Display: Marcellus, weight 400 only — hierarchy comes from size,
   letter-spacing and case, never synthesized weight. */
const marcellus = Marcellus({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-marcellus",
  display: "swap",
});

const figtree = Figtree({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Ekmool — GI-Tagged Single-Origin Indian Foods",
    template: "%s | Ekmool",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: "/",
    title: "Ekmool — GI-Tagged Single-Origin Indian Foods",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/brand/ekmool-logo-primary-2048.png",
        width: 2048,
        height: 1792,
        alt: "Ekmool — single origin, India",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ekmool — GI-Tagged Single-Origin Indian Foods",
    description: SITE_DESCRIPTION,
    images: ["/brand/ekmool-logo-primary-2048.png"],
  },
  formatDetection: { telephone: false },
};

/**
 * `maximumScale` and `userScalable` are deliberately absent.
 *
 * Locking zoom is the most common accessibility failure on a mobile site,
 * and it is nearly always done for one reason — a layout that breaks when
 * zoomed. Ours does not, so there is nothing to hide.
 *
 * themeColor tints the Android status bar and the iOS standalone chrome.
 * It has to be a literal here for the same reason the manifest does: a
 * browser reads a meta tag, not a CSS variable. It is --color-ek-green-900.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1C3A2D",
};

/**
 * Service worker registration, inline and tiny.
 *
 * Inline because a separate file would be a network round trip for four
 * lines that must run once, and because the JS budget this site is held to
 * (190 KB transferred, per page) is measured in requests of type Script —
 * a module import for this would be real bytes on every page for something
 * no page needs during render.
 *
 * After `load`, so it never competes with the critical path. Production
 * only: a service worker in `next dev` caches HMR chunks and produces the
 * kind of bug where a change does not appear and nobody can say why.
 */
const REGISTER_SW = `
if ('serviceWorker' in navigator) {
  addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-IN"
      className={`${marcellus.variable} ${figtree.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ek-paper">
        <JsonLd data={[organizationJsonLd(), webSiteJsonLd()]} />
        <StoreProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-ek-green-900 focus:px-4 focus:py-2 focus:text-ek-cream"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <AnalyticsLoader />
          <VercelAnalytics />
          <ConsentBanner />
        </StoreProvider>
        {process.env.NODE_ENV === "production" && (
          <script
            // A constant defined above, in this file — nothing here comes
            // from a request. The CSP permits it because script-src already
            // carries 'unsafe-inline' (next.config.ts explains why there is
            // no nonce); this adds no new latitude, and the worker itself
            // is covered by the explicit worker-src 'self'.
            dangerouslySetInnerHTML={{ __html: REGISTER_SW }}
          />
        )}
      </body>
    </html>
  );
}
