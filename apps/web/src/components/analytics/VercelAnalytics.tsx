"use client";

import { useSyncExternalStore } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import {
  getConsentServerSnapshot,
  getConsentSnapshot,
  subscribeConsent,
} from "@/lib/consent";

/**
 * Vercel Web Analytics and Speed Insights, behind the same consent gate as
 * PostHog.
 *
 * Vercel's own instructions are to drop <Analytics /> and <SpeedInsights />
 * into the root layout unconditionally. That is wrong here: both set a
 * cookie-less identifier and report every page view, and mounting them
 * regardless would mean the consent banner sits above two trackers that
 * ignore it. `npm run test:consent` watches what the page requests, so it
 * would also fail — correctly.
 *
 * Returning null before consent means neither component mounts, so neither
 * injects its script. That is the same load-condition-not-filter shape
 * AnalyticsLoader uses for PostHog.
 *
 * Both are also no-ops off Vercel: their scripts are served from
 * /_vercel/*, which only exists on Vercel's platform. The Docker and VPS
 * deployments carry the components and fetch nothing.
 */
export function VercelAnalytics() {
  const decision = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );

  // "unread" and "undecided" both deny, matching AnalyticsLoader: deny is
  // the default, and a visitor who has not answered has not consented.
  const allowed =
    decision !== "unread" &&
    decision !== "undecided" &&
    decision.analytics;

  if (!allowed) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
