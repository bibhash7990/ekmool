import { NextResponse, type NextRequest } from "next/server";
import { rateLimiter, limitsFor, clientIp } from "@/lib/rate-limit";

/**
 * Next 16 request interception (formerly middleware.ts). Runs on the
 * Node.js runtime.
 *
 * Deliberately narrow: the matcher below excludes every public page, so
 * browsing paths are served straight from the static/ISR cache and never
 * pay for this hop. Clerk is wired in here in M5, guarded by hasClerk.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // Health and the payment webhook are exempt: uptime probes and
    // Razorpay retries must never be throttled.
    const exempt =
      pathname.startsWith("/api/health") ||
      pathname.startsWith("/api/payment/webhook");

    if (!exempt) {
      const { limit, windowMs } = limitsFor(pathname);
      const key = `${clientIp(request.headers)}:${limit}`;
      const result = rateLimiter.check(key, limit, windowMs);

      if (!result.allowed) {
        return NextResponse.json(
          {
            error: "Too many requests",
            code: "RATE_LIMITED",
            retryAfter: result.retryAfter,
          },
          {
            status: 429,
            headers: {
              "retry-after": String(result.retryAfter),
              "x-ratelimit-limit": String(limit),
              "x-ratelimit-remaining": "0",
            },
          },
        );
      }

      const response = NextResponse.next();
      response.headers.set("x-ratelimit-limit", String(limit));
      response.headers.set("x-ratelimit-remaining", String(result.remaining));
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/account/:path*"],
};
