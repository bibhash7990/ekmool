import type { Metadata } from "next";
import { Marcellus, Figtree } from "next/font/google";
import "./globals.css";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { AnalyticsLoader } from "@/components/analytics/AnalyticsLoader";
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
        </StoreProvider>
      </body>
    </html>
  );
}
