import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  rateLimiter,
  limitsFor,
  clientIp,
  readInstallId,
  dualLimitsFor,
  installBucketKey,
  looseIpBucketKey,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { hasClerk } from "@/lib/env";

/**
 * Next 16 request interception (formerly middleware.ts). Runs on the
 * Node.js runtime, which is what lets the limiter hold state at all —
 * in memory on one instance, in Redis across several.
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

async function applyRateLimit(
  request: NextRequest,
): Promise<NextResponse | null> {
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

  const ip = clientIp(request.headers);

  // The install id is a fairness mechanism and not a credential — see the
  // comment on readInstallId. A request without a well-formed one takes the
  // branch below unchanged, down to the bucket key, because every existing
  // limit assertion in test:consent and test:account is written against it.
  const installId = readInstallId(request.headers);
  const dual = installId ? dualLimitsFor(pathname) : null;

  const { limit, windowMs } = dual ? dual.install : limitsFor(pathname);

  let result: RateLimitResult;

  if (dual && installId) {
    // Both, in parallel, and refused if either refuses.
    //
    // Parallel rather than sequential: on the allowed path both buckets are
    // consumed regardless, so short-circuiting would save a round trip only
    // when a request is already being refused, while costing every honest
    // request a second serialised hop to Upstash.
    //
    // A consequence worth stating: when one bucket allows and the other
    // refuses, the allowing bucket has still spent a token. Reserving in one
    // bucket and rolling back on the other's refusal would need a two-phase
    // commit across two Redis keys to fix an over-charge of at most one
    // token, on a request that is being refused anyway.
    const [byInstall, byIp] = await Promise.all([
      rateLimiter.check(
        installBucketKey(installId, dual.install.limit),
        dual.install.limit,
        dual.install.windowMs,
      ),
      rateLimiter.check(
        // `${ip}:${limit}` when the route is not loosening its IP bucket, so
        // it is the same bucket a browser uses rather than a second one of
        // the same size beside it — which would have doubled the limit it
        // means to leave alone. See DualBucketPlan.loosenIp.
        dual.loosenIp
          ? looseIpBucketKey(ip, dual.ip.limit)
          : `${ip}:${dual.ip.limit}`,
        dual.ip.limit,
        dual.ip.windowMs,
      ),
    ]);

    // Report the tighter of the two remainders, so a client pacing itself
    // against the header paces against the bucket that will actually stop
    // it. `limit` above is the per-install one for the same reason: it is
    // the number a single well-behaved install can plan around.
    result = {
      allowed: byInstall.allowed && byIp.allowed,
      retryAfter: Math.max(byInstall.retryAfter, byIp.retryAfter),
      remaining: Math.min(byInstall.remaining, byIp.remaining),
    };
  } else {
    result = await rateLimiter.check(`${ip}:${limit}`, limit, windowMs);
  }

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
  const limited = await applyRateLimit(request as NextRequest);
  if (limited) return limited;
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

type ProxyEvent = Parameters<typeof withClerk>[1];

export async function proxy(request: NextRequest, event: ProxyEvent) {
  if (hasClerk) {
    return withClerk(request, event);
  }
  return (await applyRateLimit(request)) ?? NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/account/:path*"],
};
