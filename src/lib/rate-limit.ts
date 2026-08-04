/**
 * Token-bucket rate limiting behind an interface, so swapping the
 * in-memory store for Redis later means writing one class.
 *
 * In-memory is correct for a single origin node; the Next 16 proxy runs
 * on the Node.js runtime, so module state persists across requests.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the next token is available (only when blocked). */
  retryAfter: number;
  remaining: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class InMemoryTokenBucket implements RateLimiter {
  #buckets = new Map<string, Bucket>();
  #lastSweep = 0;

  check(key: string, limit: number, windowMs: number): RateLimitResult {
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

export const rateLimiter: RateLimiter = new InMemoryTokenBucket();

/** Per-route limits from the brief: 10/min checkout, 60/min everything else. */
export function limitsFor(pathname: string): { limit: number; windowMs: number } {
  if (pathname.startsWith("/api/checkout")) {
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
