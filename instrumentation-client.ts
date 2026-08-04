/**
 * Client-side Sentry.
 *
 * Two deliberate reductions, both driven by the 170 KB first-load JS budget
 * that Core Web Vitals depend on:
 *
 * 1. Errors only. Note that `integrations: []` does NOT get you this — it
 *    means "add nothing beyond the defaults", and the defaults include
 *    BrowserTracing and BrowserSession. They have to be filtered out by
 *    name. BrowserSession in particular fires a session request on every
 *    pageview, which is a per-visitor network cost we will not pay at
 *    10,000 concurrent users. Server-side tracing (10% sample) still
 *    covers the paths that matter: checkout, orders, webhook.
 *
 * 2. The SDK is imported dynamically, so `@sentry/nextjs` lands in its own
 *    chunk instead of the shared client bundle. A static import cost 12.7 KB
 *    transferred on every page — paid by all 10,000 browsing users — even
 *    with no DSN set, because bundlers cannot drop a module that a top-level
 *    import pulled in. With no DSN the chunk is never requested at all.
 *
 * The trade-off is that errors thrown between hydration and the dynamic
 * import resolving are missed. That is a narrow window on pages which are
 * static HTML with almost no client logic, and it buys every visitor a
 * smaller critical path.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** Default integrations we opt out of. Breadcrumbs stays — it is cheap and
    it is most of what makes a captured error diagnosable. */
const DROPPED_INTEGRATIONS = new Set(["BrowserTracing", "BrowserSession"]);

type RouterTransitionHandler = (href: string, navigationType: string) => void;

let captureRouterTransitionStart: RouterTransitionHandler | undefined;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      integrations: (defaults) =>
        defaults.filter(
          (integration) => !DROPPED_INTEGRATIONS.has(integration.name),
        ),
      tracesSampleRate: 0,
      sendDefaultPii: false,
      enableLogs: false,
    });

    captureRouterTransitionStart = Sentry.captureRouterTransitionStart;
  });
}

/**
 * Next calls this on every client navigation. It has to exist synchronously
 * at module scope, so it forwards to the real handler once the SDK is in.
 */
export const onRouterTransitionStart: RouterTransitionHandler = (
  href,
  navigationType,
) => {
  captureRouterTransitionStart?.(href, navigationType);
};
