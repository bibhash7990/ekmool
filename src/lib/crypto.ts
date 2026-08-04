import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string compare that does not leak length through early
 * return. Used for every shared-secret header check.
 */
export function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still run a compare of equal-length buffers so timing stays flat.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Hex HMAC-SHA256 — Razorpay webhook signatures. */
export function hmacSha256Hex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}
