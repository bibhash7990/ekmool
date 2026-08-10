import { NextResponse } from "next/server";
import { pingDb } from "@/db/pool";
import { pingRedis, hasRedis } from "@/lib/redis";
import { rateLimiterBacking } from "@/lib/rate-limit";
import { instanceId } from "@/lib/purge-channel";
import { bootOnce } from "@/lib/boot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const startedAt = Date.now();

/**
 * Liveness + dependency probe. `ok` reflects the app process, not its
 * dependencies: browsing is served from static/ISR output, so the site is
 * healthy — and correctly reported healthy — while `db` is "down".
 *
 * That distinction is the point of the endpoint. A monitor that wakes
 * somebody at 3 a.m. because a cache is unreachable, while every
 * customer-facing page is being served perfectly, teaches its readers to
 * ignore it. `ok` answers "should anyone get out of bed"; the fields under
 * it answer "what is wrong".
 *
 * `redis` reads "off" rather than "down" when REDIS_URL is unset, because
 * not having a thing is not the same as it having failed.
 *
 * `instance` is for the multi-container case: two probes returning
 * different ids is how you confirm a load balancer is actually balancing,
 * and it is the same id that appears in the cache-purge logs.
 */
export async function GET() {
  // Idempotent, and the reason it is here rather than only in
  // instrumentation.ts: the standalone bundle does not carry
  // instrumentation.js, and standalone is what Docker runs. Health is the
  // one route every deployment shape hits within seconds of boot.
  bootOnce();

  const [dbUp, redisUp] = await Promise.all([
    pingDb(),
    hasRedis ? pingRedis() : Promise.resolve(false),
  ]);

  return NextResponse.json(
    {
      ok: true,
      db: dbUp ? "up" : "down",
      redis: !hasRedis ? "off" : redisUp ? "up" : "down",
      rateLimiter: rateLimiterBacking,
      instance: instanceId(),
      uptime: Math.round((Date.now() - startedAt) / 1000),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
