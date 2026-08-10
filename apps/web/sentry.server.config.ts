import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry. Guarded by the DSN so an unconfigured deployment
 * initialises nothing at all — no client, no transport, no overhead.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // No session replay anywhere: this is a checkout flow.
    enableLogs: false,
    sendDefaultPii: false,
    beforeSend(event) {
      // Scrub anything that could carry a customer's details.
      if (event.request?.data) delete event.request.data;
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
        delete event.request.headers["x-cron-secret"];
        delete event.request.headers["x-razorpay-signature"];
      }
      return event;
    },
  });
}
