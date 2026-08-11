import type { BootstrapResponse } from "@ekmool/contracts/bootstrap";

import { apiGet } from "@/api/client";
import { CLIENT_BUILD } from "@/lib/client-info";

/**
 * `GET /api/v1/bootstrap` — how the graceful-degradation contract reaches
 * this app.
 *
 * The web computes `hasRazorpay` in `apps/web/src/lib/env.ts` and renders
 * against it on the server, so a shop with no Razorpay keys simply never
 * draws a pay button. A phone renders on the device and cannot see the
 * server's environment, so it has to be told.
 *
 * **The safe default, when this cannot be reached, is `razorpay: false`** —
 * Cash on Delivery. That is the direction the web degrades in, and it means a
 * bootstrap outage costs online payment rather than the ability to order. The
 * opposite default is the one that looks harmless in review: it draws a pay
 * button that 400s with `RAZORPAY_NOT_CONFIGURED` at the last step of a
 * checkout the customer has already filled in.
 *
 * Fetched once per cold start, with a **short** timeout. The document is
 * `no-store` and about 150 bytes, so there is nothing to cache and nothing to
 * save by caching it — and a slow or absent bootstrap must not hold up the
 * first screen, which is why the default exists rather than a spinner.
 */

/**
 * What the app actually acts on, which is less than the document carries.
 *
 * `generatedAt` is dropped: the contract says it is there so a support
 * conversation can establish how stale a copy is, and this document is never
 * stale — it is refetched every launch and never written to disk. Carrying it
 * would invite a screen to render it, which would be printing a server clock
 * to a customer.
 *
 * `reachable` is added, and is the only field that is not the server's. A
 * screen that offers Cash on Delivery only should be able to say whether that
 * is the shop's answer or the network's.
 */
export interface Capabilities {
  /** Online payment available right now. False also means "we could not ask". */
  razorpay: boolean;
  /** The oldest build the server will still answer correctly. */
  minClientBuild: number;
  /** Server-composed wording for the update screen, or null for the app's own. */
  messageForOlderClients: string | null;
  /** False when these are the baked-in defaults rather than the server's answer. */
  reachable: boolean;
}

/**
 * `minClientBuild: 1` matches the server's own default, so an unreachable
 * bootstrap walls off nobody — the update gate is a thing the server turns
 * on, and a client that cannot ask must not invent it.
 */
export const SAFE_DEFAULT_CAPABILITIES: Capabilities = {
  razorpay: false,
  minClientBuild: 1,
  messageForOlderClients: null,
  reachable: false,
};

/**
 * Short on purpose. This runs while the first screen is being drawn; the
 * document is 150 bytes off a route that touches no database and no third
 * party, so if it has not answered in four seconds the network is not going
 * to produce it in time to matter, and the safe default is already correct.
 */
const BOOTSTRAP_TIMEOUT_MS = 4_000;

/**
 * Validated field by field rather than cast.
 *
 * `version` is checked because the contract says a client that finds a number
 * it does not recognise should fall back to its baked-in defaults rather than
 * guess at a shape it has never seen — and because "the response parsed as
 * JSON" is not the same claim as "the response is this document".
 */
function toCapabilities(body: unknown): Capabilities | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  if (record.version !== 1) return null;

  const payments = record.payments;
  const razorpay =
    typeof payments === "object" &&
    payments !== null &&
    typeof (payments as Record<string, unknown>).razorpay === "boolean"
      ? ((payments as Record<string, unknown>).razorpay as boolean)
      : null;
  if (razorpay === null) return null;

  const minClientBuild = record.minClientBuild;
  const message = record.messageForOlderClients;

  return {
    razorpay,
    minClientBuild:
      typeof minClientBuild === "number" && Number.isSafeInteger(minClientBuild)
        ? minClientBuild
        : SAFE_DEFAULT_CAPABILITIES.minClientBuild,
    messageForOlderClients: typeof message === "string" && message.length > 0 ? message : null,
    reachable: true,
  };
}

let inFlight: Promise<Capabilities> | null = null;
let resolved: Capabilities | null = null;

async function fetchCapabilities(): Promise<Capabilities> {
  const result = await apiGet<BootstrapResponse>("/api/v1/bootstrap", {
    timeoutMs: BOOTSTRAP_TIMEOUT_MS,
  });

  // Every failure path lands on the same value, including a 429 and a 500.
  // There is no retry loop here: the app is usable on the defaults, and a
  // client that hammers the one endpoint that must not fail is the way to
  // make it fail.
  if (!result.ok) return SAFE_DEFAULT_CAPABILITIES;

  const capabilities = toCapabilities(result.data);
  if (!capabilities) return SAFE_DEFAULT_CAPABILITIES;

  resolved = capabilities;
  return capabilities;
}

/**
 * The capabilities for this cold start, fetched at most once.
 *
 * Memoised on the promise rather than on the value, so the five screens that
 * mount in the first second share one request instead of racing five.
 *
 * A failure is **not** memoised: `inFlight` is cleared either way, so the
 * next caller — the checkout screen, typically, several minutes and one
 * tunnel later — asks again. Caching "we could not reach the server" for the
 * life of the process would turn a ten-second outage at launch into a
 * COD-only session for a customer who has had signal ever since.
 */
export function loadCapabilities(): Promise<Capabilities> {
  if (resolved) return Promise.resolve(resolved);
  inFlight ??= fetchCapabilities().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Asks again, discarding a previously successful answer. Pull-to-refresh, sign-in. */
export function refreshCapabilities(): Promise<Capabilities> {
  resolved = null;
  inFlight = null;
  return loadCapabilities();
}

/**
 * What has already been answered, without a request. Null before the first
 * fetch resolves — callers render `SAFE_DEFAULT_CAPABILITIES` until then,
 * which is the safe direction by construction.
 */
export function peekCapabilities(): Capabilities | null {
  return resolved;
}

/**
 * Whether this build is older than the server will answer correctly.
 *
 * Exposed, not acted on. The update wall is a screen and screens are drawn
 * elsewhere; what belongs here is the comparison, so there is one of it.
 *
 * Note `CLIENT_BUILD` is 0 when the binary states no build number, and 0
 * fails every check — the safe direction the contract asks for, and a real
 * consequence today, because `app.config.js` sets neither `ios.buildNumber`
 * nor `android.versionCode`. See the comment on `readBuild` in
 * `src/lib/client-info.ts`; the fix is in that config file, not in a fudge
 * here.
 */
export function isClientOutdated(capabilities: Capabilities): boolean {
  // An unreachable bootstrap must never wall the app off: the customer would
  // be shown "please update" by an app that simply could not ask.
  if (!capabilities.reachable) return false;
  return CLIENT_BUILD < capabilities.minClientBuild;
}
