import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { rateLimiter, limitsFor, clientIp } from "@/lib/rate-limit";
import { hasClerk } from "@/lib/env";

/**
 * Next 16 request interception (formerly middleware.ts). Runs on the
 * Node.js runtime, so the in-memory rate limiter keeps its state.
 *
 * Deliberately narrow: the matcher below excludes every public page, so
 * browsing paths are served straight from the static/ISR cache and never
 * pay for this hop. Guest checkout never touches Clerk.
 */

/**
 * Only the owner's surfaces. /account is deliberately absent: a customer
 * gets in with the signed session cookie from /track, and auth.protect()
 * here would bounce them to a Clerk sign-in they have no account for.
 * The account layout resolves the identity itself, accepting either door.
 */
const isProtectedRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);

function applyRateLimit(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return null;

  // Health and the payment webhook are exempt: uptime probes and
  // Razorpay retries must never be throttled.
  if (
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/payment/webhook")
  ) {
    return null;
  }

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

/**
 * Clerk is only invoked when real keys are present. Without them the auth
 * layer is inert and /admin 404s from its own layout, so the site builds
 * and sells with no Clerk account at all.
 */
const withClerk = clerkMiddleware(async (auth, request) => {
  const limited = applyRateLimit(request as NextRequest);
  if (limited) return limited;
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

type ProxyEvent = Parameters<typeof withClerk>[1];

export function proxy(request: NextRequest, event: ProxyEvent) {
  if (hasClerk) {
    return withClerk(request, event);
  }
  return applyRateLimit(request) ?? NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/account/:path*"],
};
