import type { ServiceabilityResultResponse } from "@ekmool/contracts/responses";

import { apiGet, type ApiResult } from "@/api/client";

/**
 * `GET /api/serviceability?pincode=` — the postal circle and the delivery
 * band for a six-digit PIN code.
 *
 * **A live call, deliberately not cached on the device.** It is a few hundred
 * bytes off a route that touches no database, and a stale delivery estimate
 * is a promise the shop then breaks: the bands in `@ekmool/core/serviceability`
 * are the same numbers `/shipping-policy` publishes, so a phone quoting a
 * copy from last month would be quoting a policy that has moved. The route
 * sends `cache-control: public, max-age=86400` for the CDN's benefit, which
 * is the right place for that cache to live — in front of the origin, not
 * inside an app that cannot be told when it is wrong.
 *
 * **The answer is information, never a gate.** `UNASSIGNED` and
 * `ARMY_POSTAL` come back at 200 because they are honest answers about a real
 * address, not failures; only a malformed PIN code carries a 4xx, and this
 * function is not called until the input is six digits. A caller that cannot
 * reach the route shows no estimate and lets the customer carry on — refusing
 * an order because a delivery estimate did not load would be inventing a
 * requirement the shop does not have.
 */

/**
 * Shorter than the 12-second default. This runs while somebody is still
 * typing their address; an estimate that lands after they have moved on is
 * not an estimate, it is a distraction, and the screen is correct without it.
 */
const SERVICEABILITY_TIMEOUT_MS = 8_000;

export function checkServiceability(
  pincode: string,
  options: { signal?: AbortSignal } = {},
): Promise<ApiResult<ServiceabilityResultResponse>> {
  return apiGet<ServiceabilityResultResponse>(
    `/api/serviceability?pincode=${encodeURIComponent(pincode)}`,
    { timeoutMs: SERVICEABILITY_TIMEOUT_MS, signal: options.signal },
  );
}

/**
 * The band, in the words the customer should read.
 *
 * `minDays`/`maxDays` at the top level of the reply **include the dispatch
 * day**; `zone.minDays`/`zone.maxDays` are transit only. Reading the zone's
 * pair would quote every delivery a day early, which is the exact direction
 * of error `@ekmool/core/serviceability` says to avoid — an estimate that
 * runs long is a pleasant surprise, one that runs short is a broken promise.
 * No arithmetic here: the server already added the dispatch day.
 */
export function deliveryBand(result: ServiceabilityResultResponse): string | null {
  if (result.code !== "OK" || result.minDays === null || result.maxDays === null) {
    return null;
  }
  return `${result.minDays} to ${result.maxDays} working days from order`;
}
