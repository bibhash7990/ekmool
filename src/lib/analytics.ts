/**
 * Analytics façade. Call `track()` from anywhere in client code — it is a
 * no-op until PostHog has actually loaded (which only happens when a key
 * is configured, and only on idle). Nothing here imports posthog-js, so
 * the marketing bundle stays free of it.
 */

export type AnalyticsEvent =
  | "product_viewed"
  | "variant_selected"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase_completed"
  | "payment_failed";

type Props = Record<string, string | number | boolean | undefined>;

interface PostHogLike {
  capture: (event: string, properties?: Props) => void;
}

declare global {
  var posthog: PostHogLike | undefined;
}

export function track(event: AnalyticsEvent, properties?: Props): void {
  if (typeof window === "undefined") return;
  globalThis.posthog?.capture(event, properties);
}
