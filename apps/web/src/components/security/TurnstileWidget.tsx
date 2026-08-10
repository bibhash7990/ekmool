"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

/**
 * The Turnstile widget, rendered only when a site key is configured.
 *
 * Without a key this returns null and imports nothing — no script tag, no
 * network request, no bytes. That is what keeps the zero-third-party-key
 * deployment honest rather than merely tolerated.
 *
 * The token is exposed through `onToken` rather than a hidden input,
 * because both forms that use this submit JSON through fetch, not a native
 * form post.
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  action,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  /** Shows up in Cloudflare's analytics, so a checkout is distinguishable. */
  action: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  // onToken changes identity on every parent render; a ref keeps the
  // callback current without re-rendering the widget, which would reset the
  // challenge and drop a token the visitor already earned.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!scriptReady || !containerRef.current || widgetId.current !== null) {
      return;
    }

    const turnstile = globalThis.turnstile;
    if (!turnstile) return;

    widgetId.current = turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      theme: "light",
      callback: (token: string) => onTokenRef.current(token),
      // A token is single-use and expires after five minutes. Someone who
      // takes their time over an address form must not be refused for it,
      // so ask for a fresh one rather than letting the stale one fail.
      "expired-callback": () => {
        onTokenRef.current("");
        if (widgetId.current) turnstile.reset(widgetId.current);
      },
      "error-callback": () => onTokenRef.current(""),
    });

    const id = widgetId.current;
    return () => {
      widgetId.current = null;
      if (id) globalThis.turnstile?.remove(id);
    };
  }, [scriptReady, siteKey, action]);

  return (
    <>
      {/*
        afterInteractive, not lazyOnload.

        lazyOnload defers injection until the window `load` event — and this
        component mounts during hydration, by which time `load` has already
        fired. The listener waits for an event that will never come again,
        `scriptReady` never flips, and the container sits there as an empty
        div forever. Measured on /track before the change: readyState
        "complete", container present, `window.turnstile` undefined —
        while injecting the very same URL by hand resolved in under a
        second, which is what ruled out CSP, the service worker and the
        network.

        The bug was invisible for as long as no site key was configured,
        because without one the parent never renders this component at all.
        It surfaced the hour Turnstile was switched on.

        afterInteractive is also the better strategy on the merits: this is
        a bot check standing in front of a checkout button, not an
        analytics beacon. It should be ready when the visitor reaches the
        button, not whenever the browser next happens to go idle.
      */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="mt-4" />
    </>
  );
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  var turnstile: TurnstileApi | undefined;
}
