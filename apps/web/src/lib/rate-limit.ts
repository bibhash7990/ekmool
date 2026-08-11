import type Redis from "ioredis";
import { INSTALL_HEADER, INSTALL_ID_PATTERN } from "@ekmool/contracts/headers";
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

export interface RateLimitWindow {
  limit: number;
  windowMs: number;
}

/**
 * Per-route limits: 5/min order lookup and bearer session, 10/min checkout,
 * 60/min the rest. Keyed on the IP alone; `dualLimitsFor` below adds a second
 * bucket on three of these when the request carries an install id.
 */
export function limitsFor(pathname: string): RateLimitWindow {
  // Stricter than checkout because this one is guessable in principle:
  // order reference plus email is the only thing standing between a
  // stranger and someone's order history. Five a minute makes enumeration
  // pointless while leaving room for a customer mistyping twice.
  if (pathname.startsWith("/api/account/lookup")) {
    return { limit: 5, windowMs: 60_000 };
  }
  // The bearer-token door onto exactly the same proof — order reference plus
  // the email it was placed with — so it gets exactly the same number.
  //
  // And, because the bucket key is `<ip>:<limit>`, the same *bucket*: two
  // routes on one limit share one key per IP, so the pair is five a minute
  // between them rather than five each. That is emergent from the key format
  // rather than designed, and it is the direction worth having by accident —
  // a second door onto one secret must not double the guesses at it.
  if (pathname.startsWith("/api/v1/session")) {
    return { limit: 5, windowMs: 60_000 };
  }
  if (pathname.startsWith("/api/checkout")) {
    return { limit: 10, windowMs: 60_000 };
  }
  // The account area's JSON reads — order history and the address book, both
  // added for the phone. Sixty a minute is the default, and it is written out
  // here rather than left implicit so that the number these two routes run
  // under is a decision on the record instead of whatever the fallthrough
  // happens to be next year.
  //
  // Two tighter alternatives were rejected:
  //
  //  - A small write bucket for saving an address. `limitsFor` keys on the
  //    path and knows nothing about the method, so any number chosen for the
  //    POST also throttles the GET the address screen makes on open — and the
  //    write is already bounded by MAX_ADDRESSES (10) in the query layer,
  //    which is a far harder ceiling than a minute bucket.
  //  - A second, per-install bucket via `dualLimitsFor`. That costs a second
  //    Redis round trip on every request, and the fairness problem it solves
  //    is a property of a *tight* bucket: at sixty a minute an honest phone
  //    behind a carrier NAT is nowhere near the edge. See the note there on
  //    why only three routes take it.
  //
  // Neither route is guessable in principle the way lookup is — both need a
  // valid signature before they read anything — so the 5/min reasoning above
  // does not apply.
  if (
    pathname.startsWith("/api/account/orders") ||
    pathname.startsWith("/api/account/addresses")
  ) {
    return { limit: 60, windowMs: 60_000 };
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

/* -------------------------------------------------------------------------
 * Install ids: carrier NAT fairness
 * ---------------------------------------------------------------------- */

/**
 * The install id from `X-Ekmool-Install`, or null.
 *
 * An install id is generated by the client, so a determined attacker mints a
 * new one per request and walks straight past the per-install bucket. It is
 * **not** a security boundary and must not be described as one.
 *
 * It is a fairness mechanism. Its job is that two honest customers behind one
 * carrier NAT do not take each other's tokens. Mobile networks put very large
 * numbers of subscribers behind a single address, and on a 5/min route the
 * second customer to look up an order in a given minute can be refused for
 * something the first one did — a 429 the copy explains as "too many
 * requests" to somebody who made one. The security boundary is the outer IP
 * bucket, which stays.
 *
 * Anything that does not match INSTALL_ID_PATTERN exactly — 32 lower-case hex
 * characters — is treated as **absent** rather than as a distinct id, which
 * is what the contract in @ekmool/contracts/headers says and is not
 * reinterpreted here. A caller that sends junk gets today's IP-only
 * behaviour, so a malformed header can never be a way to opt into the
 * loosened bucket below. The value is not lower-cased first: silently
 * accepting a second spelling would mean the same install could hold two
 * buckets, and `expo-crypto` emits lower-case hex anyway.
 */
export function readInstallId(headers: Headers): string | null {
  const raw = headers.get(INSTALL_HEADER)?.trim() ?? "";
  return INSTALL_ID_PATTERN.test(raw) ? raw : null;
}

export interface DualBucketPlan {
  /** The install's own allowance. Always a new, separate bucket. */
  install: RateLimitWindow;
  ip: RateLimitWindow;
  /**
   * Whether the IP half is a **separate, looser** bucket, or the very same
   * one a request without an install id would have used.
   *
   * This distinction is the whole difference between loosening a limit and
   * doubling it. Two buckets of ten a minute under two different keys are
   * twenty a minute for that address, not ten — so a route that means to
   * leave its IP limit alone has to keep sharing the *key*, not merely
   * repeat the number.
   */
  loosenIp: boolean;
}

/**
 * The two buckets applied to an install-carrying request, or null on the
 * routes that keep a single bucket.
 *
 * Deliberately only three routes. Two Redis round trips on every request
 * under `/api` is real latency from a Vercel lambda to Upstash, and it would
 * buy nothing on the 60/min default: the fairness problem is a property of a
 * *tight* bucket, and sixty a minute is already far above what one honest
 * customer's phone does. So everything else keeps one bucket and one hop.
 *
 * The per-IP half is the interesting one:
 *
 * - `/api/v1/session` and `/api/account/lookup` get a **separate 60/min IP
 *   bucket**. Five a minute per IP was chosen to make guessing an order
 *   reference pointless; the per-install bucket now carries that job at the
 *   same number, and the IP bucket is left protecting against volume. Sixty a
 *   minute is still hopeless against an eight-character reference — an
 *   attacker minting a fresh install id per request buys twelve times more of
 *   nothing. What it buys an honest carrier is twelve customers a minute
 *   instead of five.
 *
 * - `/api/checkout` **keeps today's bucket, key and all**, and this is the
 *   deliberate asymmetry. Loosening it would hand any browser bot more order
 *   throughput for the price of a forgeable header, and on a deployment with
 *   no Turnstile keys — which this project treats as first-class — that
 *   minute bucket is the only volume brake there is. The fairness case is
 *   also weakest here: a customer places one order, not five lookups.
 *
 *   So the per-install bucket on checkout is purely additive: it can refuse
 *   a request the IP bucket would have allowed and never the reverse. It is
 *   not a fairness fix and is not claimed as one. Its one real effect is that
 *   an install cannot reset its allowance by roaming from wifi to cellular,
 *   because the id survives the address change and the IP does not. The
 *   ceiling that actually matters for native checkouts is hourly and lives at
 *   `nativeCheckoutCeiling` below.
 */
export function dualLimitsFor(pathname: string): DualBucketPlan | null {
  if (
    pathname.startsWith("/api/v1/session") ||
    pathname.startsWith("/api/account/lookup")
  ) {
    return {
      install: { limit: 5, windowMs: 60_000 },
      ip: { limit: 60, windowMs: 60_000 },
      loosenIp: true,
    };
  }
  if (pathname.startsWith("/api/checkout")) {
    return {
      install: { limit: 10, windowMs: 60_000 },
      // Identical to limitsFor("/api/checkout") on purpose, and shared with
      // it by key. If one of these two numbers is ever changed, change both.
      ip: { limit: 10, windowMs: 60_000 },
      loosenIp: false,
    };
  }
  return null;
}

/**
 * The install's own bucket.
 *
 * Prefixed so it cannot collide with an IP key: an install id is 32 hex
 * characters and an IP is not, but relying on that is relying on a format
 * the client chooses.
 */
export function installBucketKey(installId: string, limit: number): string {
  return `install:${installId}:${limit}`;
}

/**
 * The loosened IP bucket, for `loosenIp` routes only.
 *
 * The prefix is load-bearing rather than tidiness. This must **not** share
 * `<ip>:60` with the default bucket every other `/api` route uses, or a
 * phone's loosened lookup allowance would be drained by unrelated browsers
 * sitting behind the same carrier address — which is the exact unfairness
 * this whole mechanism exists to remove, re-entering through the key.
 */
export function looseIpBucketKey(ip: string, limit: number): string {
  return `ip+install:${ip}:${limit}`;
}

/* -------------------------------------------------------------------------
 * The native checkout ceiling
 * ---------------------------------------------------------------------- */

/**
 * What a request pays for declaring itself native and skipping Turnstile.
 *
 * A phone has no widget to render and no form to hide a honeypot in, so
 * `verifyChallenge` cannot run against it. The naive answer — skip the
 * challenge whenever `X-Ekmool-Client` says mobile — is a straight
 * regression in browser abuse resistance, because that header is not a
 * credential and any bot can send it. The answer that is not a regression is
 * to make the claim expensive:
 *
 * **A bot that wants volume is worse off claiming native than solving
 * Turnstile.** Solved challenges cost around a dollar per thousand, and
 * today's 10/min bucket would let a solver place 600 orders an hour from one
 * address; claiming native caps it at 10. Three orders an hour per install
 * is above any real customer and an order of magnitude below any real
 * attack, and minting fresh install ids does not escape the per-IP half.
 *
 * These are token buckets, so the refill is continuous rather than a
 * per-clock-hour reset: after three orders an install waits twenty minutes
 * for its next token, not until the top of the hour. That is the kinder
 * shape — a customer who genuinely places a fourth order is not told to come
 * back at some arbitrary time.
 */
export const NATIVE_CHECKOUT_PER_INSTALL: RateLimitWindow = {
  limit: 3,
  windowMs: 3_600_000,
};

export const NATIVE_CHECKOUT_PER_IP: RateLimitWindow = {
  limit: 10,
  windowMs: 3_600_000,
};

/**
 * Both hourly ceilings, checked together. True means the order may proceed.
 *
 * In parallel, not in sequence: both are consumed on the allowed path
 * anyway, so short-circuiting would only save a round trip on the refusal —
 * and it would cost one Upstash round trip of latency on every real order.
 *
 * The caller must return the **same generic refusal** it returns for any
 * other declined checkout. A message naming the device or the ceiling tells
 * a prober exactly which dial to work around.
 */
export async function nativeCheckoutCeiling(params: {
  installId: string;
  ip: string;
}): Promise<boolean> {
  const [perInstall, perIp] = await Promise.all([
    rateLimiter.check(
      `native-checkout:install:${params.installId}`,
      NATIVE_CHECKOUT_PER_INSTALL.limit,
      NATIVE_CHECKOUT_PER_INSTALL.windowMs,
    ),
    rateLimiter.check(
      `native-checkout:ip:${params.ip}`,
      NATIVE_CHECKOUT_PER_IP.limit,
      NATIVE_CHECKOUT_PER_IP.windowMs,
    ),
  ]);

  return perInstall.allowed && perIp.allowed;
}
