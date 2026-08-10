/**
 * `GET /api/v1/bootstrap` — how the graceful-degradation contract reaches a
 * phone.
 *
 * The web computes `hasRazorpay`, `hasSmtp` and the rest in
 * `apps/web/src/lib/env.ts` and renders against them on the server, so a
 * missing key never becomes a broken button. A native client renders on the
 * device and cannot see the server's environment, so it has to be told. This
 * document is that telling, and it is deliberately the smallest thing that
 * does the job: one capability flag, one version gate, one timestamp.
 *
 * **The client's safe default when this cannot be fetched is `razorpay:
 * false`** — Cash on Delivery, the same direction the web degrades in. A
 * bootstrap outage must cost online payment, not the ability to order.
 *
 * No copy lives in this package — see the note at the top of errors.ts —
 * with one exception, `messageForOlderClients`, which is composed on the
 * server from an environment variable precisely so it can be changed without
 * shipping an app update. That is the whole point of it.
 */

/** What the server can and cannot do right now, as a phone needs to know it. */
export interface BootstrapPayments {
  /**
   * Whether online payment is available *at this moment*, from the same
   * `hasRazorpay` flag the web checkout reads.
   *
   * False means offer Cash on Delivery and do not render a pay button. It is
   * not a permanent property of the shop: keys can be added, and the phone
   * re-reads this on every cold start.
   */
  razorpay: boolean;
}

export interface BootstrapResponse {
  /**
   * The document version, not the app's and not the API's.
   *
   * `/api/v1/bootstrap` is already versioned in its path; this is here so a
   * field can be *added* without minting `/v2`, and so a client that finds a
   * number it does not recognise can fall back to its baked-in defaults
   * rather than guess at a shape it has never seen.
   */
  version: 1;

  payments: BootstrapPayments;

  /**
   * The oldest client build the server will still answer correctly.
   *
   * A client whose own build number is below this shows a plain "this
   * version is out of date, please update" screen. Compare against the
   * `build` parsed out of `X-Ekmool-Client`; a client that cannot state its
   * build parses as build 0 and therefore always fails the check, which is
   * the safe direction.
   *
   * Default 1, so an unconfigured server walls off nobody.
   */
  minClientBuild: number;

  /**
   * What to say on that screen, or null to use the client's own wording.
   *
   * Server-composed on purpose: the one thing you cannot ship to a client
   * that is too old to be allowed to run is a new string.
   */
  messageForOlderClients: string | null;

  /**
   * ISO 8601, from the server clock.
   *
   * For support, the same as the catalogue document's: it lets someone
   * establish how stale a phone's copy of anything is. Not a cache key —
   * this document is `no-store` and is fetched fresh every cold start.
   */
  generatedAt: string;
}
