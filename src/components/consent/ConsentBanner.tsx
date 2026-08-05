"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  getConsentServerSnapshot,
  getConsentSnapshot,
  revokeAnalytics,
  subscribeConsent,
  writeConsent,
} from "@/lib/consent";

/**
 * The consent banner, and the preferences dialog behind it.
 *
 * Deliberate choices, each of which is the difference between a consent
 * mechanism and a notification:
 *
 *  - **Reject is as prominent as Accept.** Same size, same position, same
 *    weight of button. A greyed-out "reject" beside a gold "accept all" is
 *    a dark pattern, and a regulator reads it as one.
 *  - **Nothing loads while it waits.** The banner does not gate a tracker
 *    that is already running; `AnalyticsLoader` will not import posthog-js
 *    until this component has written a yes.
 *  - **Dismissing is not consenting.** There is no X. The only ways out are
 *    a decision, and the decision persists.
 *  - **It does not block the page.** No overlay, no scroll lock. Refusing to
 *    let someone read a shipping policy until they accept tracking is not
 *    freely-given consent, and it fails the "no detriment" test.
 *
 * Rendering waits for the stored decision so the server-rendered HTML and
 * the first client render agree; the banner is fixed-position, so appearing
 * a frame later costs no layout shift.
 *
 * It uses plain `<button>` and `<a>` rather than the shared `Button` and
 * `next/link`. This component sits in the root layout, so anything it
 * imports lands in every page's bundle — and a fixed banner has no use for
 * route prefetching. The script budget is 170 KB and it is measured; see
 * docs/audit.md.
 */

/** Matches Button's primary/secondary, without importing the module. */
const BUTTON_BASE =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-sm " +
  "px-5 py-2.5 text-17 font-medium transition-colors duration-200";
const BUTTON_PRIMARY = `${BUTTON_BASE} bg-ek-gold-500 text-ek-green-950 hover:bg-ek-gold-600`;
const BUTTON_SECONDARY = `${BUTTON_BASE} border border-ek-green-900 text-ek-green-900 hover:bg-ek-green-900 hover:text-ek-cream`;
export function ConsentBanner() {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // The footer link re-opens this by clearing the stored decision, and
  // another tab deciding arrives through the same subscription — so both
  // routes land here rather than in two divergent pieces of state.
  const decision = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );

  const decide = useCallback((analytics: boolean) => {
    if (!analytics) revokeAnalytics();
    writeConsent(analytics);
    setDetailsOpen(false);
  }, []);

  // "undecided" is the only state that shows the banner. "unread" is the
  // server and the hydrating client, which must render nothing; an earlier
  // decision against older categories reads as undecided — see
  // CONSENT_VERSION.
  if (decision !== "undecided") return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-heading"
      aria-describedby="consent-body"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-ek-green-200 bg-ek-paper px-5 py-5 shadow-[0_-8px_32px_rgba(20,40,30,0.12)] print:hidden"
    >
      <div className="mx-auto flex max-w-[1100px] flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="max-w-[68ch]">
          <h2
            id="consent-heading"
            className="font-display text-20 text-ek-green-900"
          >
            Cookies, honestly
          </h2>
          <p id="consent-body" className="mt-2 text-15 text-ek-green-700">
            We need a few cookies to keep your cart and your order lookup
            working — those have no alternative and are always on. Beyond
            that we would like to measure which pages help people decide, so
            we can write better ones.{" "}
            <strong className="font-medium text-ek-green-900">
              We run no advertising and sell nothing to anyone.
            </strong>{" "}
            Say no and the site behaves exactly the same.{" "}
            <a href="/privacy-policy" className="link-draw text-ek-green-900">
              Privacy policy
            </a>
          </p>

          {detailsOpen && (
            <dl className="mt-4 max-w-[68ch] border-t border-ek-green-200 pt-4 text-15">
              <div className="flex flex-col gap-1">
                <dt className="font-medium text-ek-green-900">
                  Strictly necessary · always on
                </dt>
                <dd className="text-ek-green-700">
                  Your cart, the signed cookie that proves an order is yours,
                  and the checkout&rsquo;s protection against a double
                  submission. Switching these off would mean switching off
                  the shop.
                </dd>
              </div>
              <div className="mt-4 flex flex-col gap-1">
                <dt className="font-medium text-ek-green-900">
                  Analytics · your choice
                </dt>
                <dd className="text-ek-green-700">
                  PostHog, on our own domain. Which pages were read, which
                  pack size was picked, where a checkout was abandoned.
                  Session recording is off and stays off — nobody should be
                  filmed typing an address. Say no and none of it loads at
                  all.
                </dd>
              </div>
              <div className="mt-4 flex flex-col gap-1">
                <dt className="font-medium text-ek-green-900">
                  Advertising · none
                </dt>
                <dd className="text-ek-green-700">
                  There is no switch here because there is nothing to switch.
                  No ad network, no pixel, no data sold or shared. If that
                  ever changes you will be asked again before it does.
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col">
          {/* Equal weight, deliberately. Reject is not the quiet option. */}
          <button
            type="button"
            onClick={() => decide(true)}
            className={BUTTON_PRIMARY}
          >
            Accept analytics
          </button>
          <button
            type="button"
            onClick={() => decide(false)}
            className={BUTTON_SECONDARY}
          >
            Reject analytics
          </button>
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4 hover:text-ek-green-900"
          >
            {detailsOpen ? "Hide detail" : "What each one does"}
          </button>
        </div>
      </div>
    </div>
  );
}
