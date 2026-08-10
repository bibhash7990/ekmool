/**
 * Cookie and tracking consent.
 *
 * Two rules govern this file:
 *
 *  1. **Deny by default.** Nothing that is not strictly necessary runs until
 *     the visitor has actively said yes. A banner that loads the tracker
 *     while it waits for an answer is not a consent mechanism, it is a
 *     notification. India's DPDP Act 2023 is consent-based, and any EU
 *     visitor brings GDPR with them.
 *  2. **Only categories that do something.** There is no "marketing" toggle
 *     here, because this site sets no advertising cookies and runs no ad
 *     network. Offering a switch that controls nothing is theatre, and it
 *     teaches people that these switches are meaningless. If a marketing
 *     tool is ever added, the category gets added with it and the version
 *     below is bumped so everyone is asked again.
 *
 * The decision lives in localStorage rather than a cookie. It is only ever
 * read by client code — `AnalyticsLoader` is the sole consumer — so putting
 * it in a cookie would mean transmitting it on every request, including
 * every image, for no one to read.
 */

export const CONSENT_STORAGE_KEY = "ek_consent";

/**
 * Bump this when the categories change, or when something new starts being
 * collected under an existing one. Everyone is asked again; nobody is opted
 * into something they were never shown.
 */
export const CONSENT_VERSION = 1;

export interface ConsentState {
  version: number;
  /** PostHog. Product analytics — which pages, which variants, where people drop out. */
  analytics: boolean;
  /** ISO-8601. Kept so a decision can be evidenced, which is the point of consent records. */
  decidedAt: string;
}

/**
 * Fired on the window whenever the decision changes, so the loader can react
 * without a reload. A custom event rather than a store: this is read by one
 * component and setting up state plumbing for it would be more machinery
 * than the problem deserves.
 */
export const CONSENT_EVENT = "ek:consent";

/**
 * What a component sees.
 *
 * `"unread"` is a third state, and it is load-bearing. It is what the server
 * and the hydrating client both see, because neither can know the answer —
 * localStorage does not exist on the server. Without it the banner would be
 * baked into every statically generated page and would flash on screen for
 * every returning visitor who had already answered.
 */
export type ConsentSnapshot = ConsentState | "undecided" | "unread";

function parse(raw: string | null): ConsentState | "undecided" {
  if (!raw) return "undecided";

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return "undecided";

    const record = parsed as Partial<ConsentState>;

    // A decision recorded against older categories is not a decision about
    // the current ones. Treat it as undecided and ask again.
    if (record.version !== CONSENT_VERSION) return "undecided";

    return {
      version: CONSENT_VERSION,
      analytics: record.analytics === true,
      decidedAt: typeof record.decidedAt === "string" ? record.decidedAt : "",
    };
  } catch {
    // Corrupted JSON. Undecided — which denies, because that is the default.
    return "undecided";
  }
}

/**
 * useSyncExternalStore calls the snapshot on every render and bails out only
 * on reference equality, so parsing afresh each time would re-render for
 * ever. Cache against the raw string: same string, same object.
 */
let cachedRaw: string | null = null;
let cachedSnapshot: ConsentState | "undecided" = "undecided";
let primed = false;

export function getConsentSnapshot(): ConsentState | "undecided" {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    // Private browsing or a disabled store. Undecided, which denies.
    raw = null;
  }

  if (!primed || raw !== cachedRaw) {
    primed = true;
    cachedRaw = raw;
    cachedSnapshot = parse(raw);
  }
  return cachedSnapshot;
}

/** Neither the server nor the hydrating client can know. Say so. */
export function getConsentServerSnapshot(): ConsentSnapshot {
  return "unread";
}

/**
 * Two sources, both needed. `CONSENT_EVENT` is this tab deciding;
 * `storage` is another tab deciding, which must not leave this tab showing
 * a stale answer or, worse, still tracking after a withdrawal elsewhere.
 */
export function subscribeConsent(onChange: () => void): () => void {
  const invalidate = () => {
    primed = false;
    onChange();
  };
  window.addEventListener(CONSENT_EVENT, invalidate);
  window.addEventListener("storage", invalidate);
  return () => {
    window.removeEventListener(CONSENT_EVENT, invalidate);
    window.removeEventListener("storage", invalidate);
  };
}

export function writeConsent(analytics: boolean): ConsentState {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    analytics,
    decidedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage refused. The decision still applies to this page view through
    // the event below; it simply will not survive a reload, and they will be
    // asked again. Better than pretending it was saved.
  }

  window.dispatchEvent(new Event(CONSENT_EVENT));
  return state;
}

/**
 * Back to undecided, which re-opens the banner. Used by the footer link:
 * withdrawal has to be as easy as consent (GDPR Art. 7(3), and the DPDP
 * Act's withdrawal right says the same).
 */
export function clearConsent(): void {
  revokeAnalytics();
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Storage refused; the event still re-opens the banner for this page
    // view, which is what was asked for.
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/**
 * Withdrawing consent must be as easy as giving it, and it has to actually
 * stop the collection — not merely stop future collection on the next visit.
 * PostHog is told to opt out and its own storage is cleared, so the tracker
 * that is already running goes quiet immediately.
 */
export function revokeAnalytics(): void {
  const posthog = globalThis.posthog;
  try {
    posthog?.opt_out_capturing?.();
    posthog?.reset?.(true);
  } catch {
    // If the SDK is in a bad state there is nothing more we can do from
    // here; the reload prompt in the preferences dialog is the backstop.
  }
}
