import "server-only";
import Redis, { type RedisOptions } from "ioredis";

/**
 * The one Redis connection, and the flag that says whether there is one.
 *
 * Same contract as every other integration here: unset, the application
 * runs exactly as it did before — the rate limiter falls back to its
 * in-memory bucket and cache purges stay local to the instance that made
 * them. Redis buys correctness across *several* instances, which is a
 * problem a single container does not have.
 *
 * What it is deliberately NOT used for:
 *
 *   **Sessions.** The customer session is a signed HMAC cookie carrying a
 *   verified email (src/lib/session.ts). It is stateless by design, which
 *   is why /track worked with no auth provider in the first place. Putting
 *   it in Redis would add a lookup to every request and a failure mode
 *   where Redis being down signs everybody out, in exchange for nothing.
 *
 *   **The ISR cache.** Next's cache handler is replaceable, and doing so is
 *   a much larger change than it looks — the product pages' behaviour under
 *   revalidateTag was hard-won (see src/lib/revalidate.ts) and is not worth
 *   re-deriving against a distributed store. The real multi-instance defect
 *   was narrower: a purge only reached the container that handled the admin
 *   request. That is fixed with pub/sub in revalidate.ts, which is a dozen
 *   lines rather than a rewrite.
 */

function str(value: string | undefined): string {
  return (value ?? "").trim();
}

export const redisUrl: string = str(process.env.REDIS_URL);

export const hasRedis: boolean =
  redisUrl.startsWith("redis://") || redisUrl.startsWith("rediss://");

declare global {
  var __ekmoolRedis: Redis | undefined;
  var __ekmoolRedisSub: Redis | undefined;
}

/**
 * Fail fast, never queue.
 *
 * `enableOfflineQueue: false` is the important one. Its default is true,
 * which means that while Redis is unreachable ioredis *buffers* commands
 * and resolves them when it reconnects — so a rate-limit check on a dead
 * Redis would hang the request rather than erroring, and every API call on
 * the site would stall behind it. Off, the command rejects immediately and
 * the caller falls back to the in-memory limiter, which is worse than Redis
 * and enormously better than a hung checkout.
 */
const OPTIONS: RedisOptions = {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 2_000,
  // Backoff, capped. A tight reconnect loop against a Redis that is down
  // for maintenance is a self-inflicted denial of service on the network.
  retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
};

function create(role: string, overrides: RedisOptions = {}): Redis {
  const client = new Redis(redisUrl, { ...OPTIONS, ...overrides });

  // ioredis emits 'error' on every failed reconnection attempt. An
  // unhandled 'error' on an EventEmitter is an uncaught exception, which
  // would take the process down because a cache is unavailable.
  client.on("error", (error: Error) => {
    console.error(`[redis:${role}] ${error.message}`);
  });

  void client.connect().catch(() => {
    // retryStrategy owns the retries from here.
  });

  return client;
}

/** The command connection. Null when Redis is not configured. */
export function getRedis(): Redis | null {
  if (!hasRedis) return null;
  globalThis.__ekmoolRedis ??= create("main");
  return globalThis.__ekmoolRedis;
}

/**
 * A second connection, for SUBSCRIBE.
 *
 * Redis puts a subscribed connection into a mode where it will accept
 * almost nothing else, so a client that is listening for cache purges
 * cannot also run the rate limiter. Two connections is not a workaround;
 * it is how the protocol works.
 */
export function getRedisSubscriber(): Redis | null {
  if (!hasRedis) return null;
  globalThis.__ekmoolRedisSub ??= create("sub", {
    // The opposite of the command client, deliberately.
    //
    // enableOfflineQueue: false is right on the request path — a command
    // against a dead Redis should reject rather than hang the checkout.
    // It is wrong here: this connection only ever issues SUBSCRIBE, and
    // with the queue off that call rejects outright if it lands before the
    // socket is up, which at boot it always does. Measured, not guessed:
    //   [purge] could not subscribe: Stream isn't writeable and
    //   enableOfflineQueue options is false
    // Nothing latency-sensitive waits on this connection, so letting the
    // one command it makes queue until ready costs nothing.
    enableOfflineQueue: true,
  });
  return globalThis.__ekmoolRedisSub;
}

/** For /api/health. Never throws, and never waits long. */
export async function pingRedis(timeoutMs = 1_000): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    await Promise.race([
      client.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("redis ping timeout")), timeoutMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}
