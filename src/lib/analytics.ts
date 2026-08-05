/**
 * Analytics façade. Call `track()` from anywhere in client code — it is a
 * no-op until PostHog has actually loaded, which needs a configured key
 * *and* the visitor's consent (see src/lib/consent.ts). Nothing here
 * imports posthog-js, so the marketing bundle stays free of it.
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
  /**
   * Withdrawing consent has to stop collection that is already running, not
   * merely prevent the next visit's. Optional because this is a structural
   * type over what posthog-js happens to expose, not a contract we own.
   */
  opt_out_capturing?: () => void;
  reset?: (resetDeviceId?: boolean) => void;
}

declare global {
  var posthog: PostHogLike | undefined;
}

export type { PostHogLike };

export function track(event: AnalyticsEvent, properties?: Props): void {
  if (typeof window === "undefined") return;
  globalThis.posthog?.capture(event, properties);
}
