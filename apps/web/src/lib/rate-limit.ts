import type Redis from "ioredis";
import { getRedis, hasRedis, whenReady } from "@/lib/redis";

/**
 * Token-bucket rate limiting, shared across instances when Redis is
 * configured and per-process when it is not.
 *
 * The interface was written for this swap in M5 and the swap is the whole
 * point of it. In-memory is correct for one origin node and quietly wrong
 * for several: under `docker compose up --scale app=4` each worker keeps
 * its own bucket, so a "10 checkouts a minute" limit is really forty, and
 * the 5/min on order lookup — the one standing between a stranger and
 * somebody's order history — is really twenty.
 *
 * `check` is async now. It has to be: there is no synchronous way to ask
 * another process anything.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the next token is available (only when blocked). */
  retryAfter: number;
  remaining: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class InMemoryTokenBucket implements RateLimiter {
  #buckets = new Map<string, Bucket>();
  #lastSweep = 0;

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    return this.checkSync(key, limit, windowMs);
  }

  /**
   * The arithmetic, synchronously — kept separate so the Redis limiter can
   * fall back to it inside a catch without an await it has already paid
   * for.
   */
  checkSync(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    this.#sweep(now, windowMs);

    const refillPerMs = limit / windowMs;
    const bucket = this.#buckets.get(key) ?? { tokens: limit, updatedAt: now };

    const refilled = Math.min(
      limit,
      bucket.tokens + (now - bucket.updatedAt) * refillPerMs,
    );

    if (refilled < 1) {
      this.#buckets.set(key, { tokens: refilled, updatedAt: now });
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((1 - refilled) / refillPerMs / 1000)),
        remaining: 0,
      };
    }

    this.#buckets.set(key, { tokens: refilled - 1, updatedAt: now });
    return {
      allowed: true,
      retryAfter: 0,
      remaining: Math.floor(refilled - 1),
    };
  }

  /** Drop buckets that have fully refilled — bounds memory under IP churn. */
  #sweep(now: number, windowMs: number): void {
    if (now - this.#lastSweep < 60_000) return;
    this.#lastSweep = now;
    for (const [key, bucket] of this.#buckets) {
      if (now - bucket.updatedAt > windowMs * 2) this.#buckets.delete(key);
    }
  }
}

/**
 * The same bucket, in Redis, applied atomically.
 *
 * It has to be one script rather than GET-then-SET. Read, compute, write is
 * three round trips with a gap in the middle, and forty concurrent requests
 * all read "1 token left" before any of them writes — which is precisely
 * the burst a limiter exists to stop. EVAL runs the whole thing inside
 * Redis, single-threaded, with nothing interleaved.
 *
 * The clock is **Redis's**, not the caller's. Four containers agreeing on
 * a bucket while disagreeing about the time would refill it at different
 * rates, and a container whose clock ran fast would hand out free tokens.
 * TIME is safe to call in a script on Redis 5 and later, where replication
 * is by effect rather than by re-running the script.
 */
const BUCKET_SCRIPT = `
local limit    = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])

local time = redis.call('TIME')
local now  = (tonumber(time[1]) * 1000) + (tonumber(time[2]) / 1000)

local stored  = redis.call('HMGET', KEYS[1], 'tokens', 'updated')
local tokens  = tonumber(stored[1])
local updated = tonumber(stored[2])

if tokens == nil or updated == nil then
  tokens  = limit
  updated = now
end

local refillPerMs = limit / windowMs
tokens = math.min(limit, tokens + ((now - updated) * refillPerMs))

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'updated', tostring(now))
-- Twice the window is long enough for the bucket to have refilled
-- completely, at which point forgetting it and starting fresh are the same
-- thing. Without it, every IP that ever hit the site stays in memory.
redis.call('PEXPIRE', KEYS[1], math.ceil(windowMs * 2))

-- Lua numbers come back to Redis as integers, which would round a partial
-- token to zero and report a full bucket as empty. Strings survive.
return { allowed, tostring(tokens) }
`;

interface BucketCommand {
  rateBucket(
    key: string,
    limit: string,
    windowMs: string,
  ): Promise<[number, string]>;
}

export class RedisTokenBucket implements RateLimiter {
  #client: Redis & Partial<BucketCommand>;
  #fallback: InMemoryTokenBucket;

  constructor(client: Redis, fallback: InMemoryTokenBucket) {
    this.#client = client as Redis & Partial<BucketCommand>;
    this.#fallback = fallback;

    // defineCommand does EVALSHA first and only ships the script body when
    // Redis has not seen it — so the script text crosses the wire once per
    // server, not once per request.
    client.defineCommand("rateBucket", {
      numberOfKeys: 1,
      lua: BUCKET_SCRIPT,
    });
  }

  async check(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    try {
      // A cold process would otherwise lose the race with its own
      // connection and fall through to the in-memory bucket on its first
      // request — which on Vercel is every cold lambda, and is exactly the
      // limit Redis is here to share. Bounded, so a dead Redis still fails
      // fast. See whenReady in src/lib/redis.ts.
      await whenReady(this.#client);

      const [allowed, tokensText] = await this.#client.rateBucket!(
        `rl:${key}`,
        String(limit),
        String(windowMs),
      );

      const tokens = Number(tokensText);
      if (allowed === 1) {
        return { allowed: true, retryAfter: 0, remaining: Math.floor(tokens) };
      }

      const refillPerMs = limit / windowMs;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000)),
        remaining: 0,
      };
    } catch (error) {
      // Redis is unreachable. Fall back to the per-process bucket rather
      // than failing open: weaker than the shared one, and vastly better
      // than no limit at all on the day the cache happens to be down —
      // which is exactly the day someone notices.
      console.error(
        "[rate-limit] Redis unavailable, falling back to in-memory:",
        error instanceof Error ? error.message : error,
      );
      return this.#fallback.checkSync(key, limit, windowMs);
    }
  }
}

const memory = new InMemoryTokenBucket();

function build(): RateLimiter {
  if (!hasRedis) return memory;
  const client = getRedis();
  if (!client) return memory;
  return new RedisTokenBucket(client, memory);
}

export const rateLimiter: RateLimiter = build();

/** Which store is actually in use — reported by /api/health. */
export const rateLimiterBacking: "redis" | "memory" = hasRedis
  ? "redis"
  : "memory";

/** Per-route limits: 5/min order lookup, 10/min checkout, 60/min the rest. */
export function limitsFor(pathname: string): { limit: number; windowMs: number } {
  // Stricter than checkout because this one is guessable in principle:
  // order reference plus email is the only thing standing between a
  // stranger and someone's order history. Five a minute makes enumeration
  // pointless while leaving room for a customer mistyping twice.
  if (pathname.startsWith("/api/account/lookup")) {
    return { limit: 5, windowMs: 60_000 };
  }
  if (pathname.startsWith("/api/checkout")) {
    return { limit: 10, windowMs: 60_000 };
  }
  // Takes an email address off a form. Nobody legitimately registers
  // interest in ten packs a minute, and the cheapest way to make a
  // subscribe-someone-else nuisance not worth the effort is to make it slow.
  if (pathname.startsWith("/api/back-in-stock")) {
    return { limit: 10, windowMs: 60_000 };
  }
  return { limit: 60, windowMs: 60_000 };
}

/** Best-effort client IP behind Cloudflare / Vercel / Nginx. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
