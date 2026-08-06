import * as Sentry from "@sentry/nextjs";

/**
 * Runs under `next start` and on Vercel. It does **not** run in the
 * standalone bundle — Next's tracer leaves instrumentation.js out of
 * `.next/standalone`, which is what the Dockerfile serves — so the same
 * work is also reachable from `/api/health` via `bootOnce()`. See
 * src/lib/boot.ts; that comment has the measurement.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootOnce } = await import("./src/lib/boot");
    bootOnce();
  }

  // The edge runtime has no shared Redis client and no boot hook — it is a
  // separate isolate per invocation — so its Sentry init stays here.
  if (process.env.NEXT_RUNTIME === "edge" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    await import("./sentry.edge.config");
  }
}

/** Enriches server errors with the route that produced them. */
export const onRequestError = Sentry.captureRequestError;
