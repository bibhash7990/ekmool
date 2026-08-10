"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  getConsentServerSnapshot,
  getConsentSnapshot,
  subscribeConsent,
} from "@/lib/consent";

/**
 * Loads PostHog lazily, and only when a key is configured **and** the
 * visitor has consented to analytics.
 *
 * The consent check is the load condition, not a filter applied afterwards.
 * `import("posthog-js")` is never reached without a yes, so nothing is
 * fetched, nothing is initialised, and no cookie is written — the banner is
 * not decorating a tracker that runs regardless. That is what
 * `npm run test:consent` asserts, by watching what the page requests.
 *
 * posthog-js is dynamically imported on idle (or first interaction after
 * consent, whichever comes first), so it never lands in the initial bundle
 * and cannot compete with the LCP. Requests go through the /ingest rewrite
 * on our own origin, which survives ad-blockers.
 *
 * Once loaded it is attached to globalThis.posthog, which is what
 * lib/analytics.ts `track()` calls into — before that, every track() is a
 * silent no-op.
 */
export function AnalyticsLoader() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const pathname = usePathname();

  const decision = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );

  // "unread" and "undecided" both deny. Deny is the default, and a visitor
  // who has not answered has not consented.
  const allowed = decision !== "unread" && decision !== "undecided" && decision.analytics;

  useEffect(() => {
    if (!key || !allowed || globalThis.posthog) return;

    let cancelled = false;

    async function load() {
      const { default: posthog } = await import("posthog-js");
      if (cancelled || globalThis.posthog) return;

      posthog.init(key!, {
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        defaults: "2025-05-24",
        capture_pageview: true,
        capture_pageleave: true,
        // Never on for a checkout flow.
        disable_session_recording: true,
        persistence: "localStorage+cookie",
      });

      globalThis.posthog = posthog;
    }

    const supportsIdle = typeof window.requestIdleCallback === "function";
    const handle = supportsIdle
      ? window.requestIdleCallback(() => void load(), { timeout: 4000 })
      : window.setTimeout(() => void load(), 2000);

    // Whichever comes first: browser idle, or the visitor doing something.
    const onInteract = () => void load();
    window.addEventListener("pointerdown", onInteract, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", onInteract, { once: true });

    return () => {
      cancelled = true;
      if (supportsIdle) {
        window.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, [key, allowed]);

  // App Router client navigations do not emit a native pageview.
  useEffect(() => {
    if (!key || !allowed) return;
    globalThis.posthog?.capture("$pageview", {
      $current_url: window.location.href,
    });
  }, [pathname, key, allowed]);

  return null;
}
