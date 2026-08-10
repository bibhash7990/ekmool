import "server-only";

/**
 * Process-level startup, run once, from somewhere that actually executes.
 *
 * The obvious home for this is `instrumentation.ts`, and that is still one
 * of its callers. But it is not sufficient, which was measured rather than
 * assumed:
 *
 *   $ ls .next/server/instrumentation.js              # exists
 *   $ ls .next/standalone/.next/server/               # no instrumentation
 *
 * Next's standalone tracer does not carry `instrumentation.js` into the
 * bundle, and the standalone bundle is what the Dockerfile runs and what
 * docs/deploy.md deploys. So `register()` has never run in production here
 * — which the cross-instance cache purge would have depended on, and which
 * **Sentry's server-side initialisation already did**. Server errors in the
 * Docker deployment were never reaching Sentry; only the browser half was.
 * That is a real defect this milestone found by accident, and it is the
 * same one line to fix.
 *
 * So this is called from `/api/health` as well. Health is probed by the
 * container's own healthcheck within seconds of boot, by nginx, and by the
 * uptime monitor — it is the one route guaranteed to be hit early on every
 * deployment shape. `bootOnce` is idempotent and cheap, so calling it per
 * request costs a boolean check.
 */

declare global {
  var __ekmoolBooted: boolean | undefined;
}

export function bootOnce(): void {
  if (globalThis.__ekmoolBooted) return;
  globalThis.__ekmoolBooted = true;

  // Cross-instance cache purges. A no-op without REDIS_URL, which is the
  // single-container case — where a purge is already global because there
  // is only one cache.
  void import("@/lib/purge-subscriber")
    .then(({ startPurgeSubscriber }) => startPurgeSubscriber())
    .catch((error: unknown) => {
      console.error(
        "[boot] purge subscriber failed to start:",
        error instanceof Error ? error.message : error,
      );
    });

  // Server-side error reporting. Dynamic, and only when a DSN is set, so a
  // build with no Sentry account never constructs a client.
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    void import("../../sentry.server.config").catch((error: unknown) => {
      console.error(
        "[boot] Sentry server init failed:",
        error instanceof Error ? error.message : error,
      );
    });
  }
}
