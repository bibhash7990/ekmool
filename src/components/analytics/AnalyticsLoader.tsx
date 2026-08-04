"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Loads PostHog lazily, and only when a key is configured.
 *
 * posthog-js is dynamically imported on idle (or first interaction,
 * whichever comes first), so it never lands in the initial bundle and
 * cannot compete with the LCP. Requests go through the /ingest rewrite
 * on our own origin, which survives ad-blockers.
 *
 * Once loaded it is attached to globalThis.posthog, which is what
 * lib/analytics.ts `track()` calls into — before that, every track() is
 * a silent no-op.
 */
export function AnalyticsLoader() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const pathname = usePathname();

  useEffect(() => {
    if (!key || globalThis.posthog) return;

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
  }, [key]);

  // App Router client navigations do not emit a native pageview.
  useEffect(() => {
    if (!key) return;
    globalThis.posthog?.capture("$pageview", { $current_url: window.location.href });
  }, [pathname, key]);

  return null;
}
