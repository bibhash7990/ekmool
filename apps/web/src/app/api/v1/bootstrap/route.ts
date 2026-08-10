import { NextResponse } from "next/server";
import type { BootstrapResponse } from "@ekmool/contracts/bootstrap";
import { hasRazorpay, minClientBuild, olderClientMessage } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/v1/bootstrap` — the graceful-degradation contract, for a client
 * that cannot read the server's environment.
 *
 * The web computes `hasRazorpay` in src/lib/env.ts and renders against it on
 * the server, so a shop with no Razorpay keys simply never draws a pay
 * button. A phone renders on the device. Without this document it would
 * either draw a button that cannot work or hard-code Cash on Delivery
 * forever, and both are wrong in a way the customer pays for.
 *
 * **Dynamic and `no-store`, deliberately.** Everything else new in this
 * phase is static and cached hard, because a catalogue that is an hour stale
 * is fine. A capability flag that is an hour stale is not: it is the hour
 * after keys are added in which the shop still refuses online payment, or
 * the hour after they are removed in which it offers a button that 400s. The
 * document is about 150 bytes and is fetched once per cold start, so there
 * is nothing to save by caching it anyway.
 *
 * **It works with every third-party key removed** — that is the test for any
 * new integration here. With no Razorpay key this returns 200 and
 * `razorpay: false`; there is no configuration under which it errors,
 * because it reads nothing but flags already computed at module load. It
 * touches no database and no third party, so it also answers while MySQL is
 * down, which matters: a phone that cannot bootstrap cannot decide anything.
 *
 * **The client's safe default when it cannot reach this is `razorpay:
 * false`.** That is the same direction the web degrades in, and it means a
 * bootstrap outage costs online payment rather than the ability to order.
 * The client half of that is Phase 3; it is written here because the
 * contract only holds if both ends agree on which way to fail, and this is
 * the end that outlives any particular app build.
 *
 * Rate limiting: the default 60/min IP bucket from src/proxy.ts applies, and
 * is left at the default on purpose. Once per cold start is nowhere near it,
 * and a tighter number would throttle a fleet of phones behind one carrier
 * address out of their capability check — which is the one request that must
 * not fail, because failing it is what makes an app guess.
 */
export async function GET(): Promise<NextResponse<BootstrapResponse>> {
  const body: BootstrapResponse = {
    version: 1,
    payments: {
      razorpay: hasRazorpay,
    },
    minClientBuild,
    // "" means unset. Sent as null rather than an empty string so a client
    // can fall back to its own wording with a plain null check instead of
    // having to know that "" is also absent.
    messageForOlderClients: olderClientMessage || null,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: { "cache-control": "no-store" },
  });
}
