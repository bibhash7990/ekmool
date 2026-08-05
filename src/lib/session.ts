import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { hmacSha256Hex, timingSafeEquals } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

/**
 * Customer sessions without an auth provider.
 *
 * There is no password to store because there is no account to create. A
 * customer proves an order is theirs at /track by quoting its reference and
 * the email they checked out with; we then hand back a signed cookie
 * carrying that verified address, and *that* is the account. Everything
 * personal — order history, profile, saved addresses — is scoped to the
 * email inside this cookie and never to anything the request supplies.
 *
 * The cookie is signed, not encrypted. It contains an email address the
 * holder already knew, so there is nothing to hide; what matters is that it
 * cannot be forged, which the HMAC gives us.
 */

export const SESSION_COOKIE = "ek_session";

/** 30 days. Long enough to be useful, short enough to expire a shared device. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * SESSION_SECRET is the only new required-in-production variable in this
 * milestone. Without it we generate one per process rather than refusing to
 * start, because the whole site is built to run with zero configured keys.
 *
 * The consequence is honest and worth knowing: an ephemeral secret is just
 * as strong cryptographically, but it dies with the process, so every
 * restart signs everyone out and multiple instances cannot read each other's
 * cookies. That is fine on a laptop and wrong on a server, hence the warning.
 *
 * Cached on globalThis, like the database pool, and for a sharper reason
 * than HMR: Next bundles each route into its own server chunk, so a plain
 * module-level constant is a *different* value in /api/account/lookup and
 * in /track. A cookie signed by one would then fail to verify in the other,
 * and the account would appear to work everywhere except where it matters.
 */
declare global {
  var __ekmoolSessionSecret: string | undefined;
}

function resolveSecret(): string {
  const configured = (process.env.SESSION_SECRET ?? "").trim();
  if (configured.length >= 16 && !/placeholder|changeme|your[-_]/i.test(configured)) {
    return configured;
  }
  if (!globalThis.__ekmoolSessionSecret) {
    globalThis.__ekmoolSessionSecret = randomBytes(32).toString("hex");
    console.warn(
      "[session] SESSION_SECRET is not set — using a per-process secret. " +
        "Sessions will not survive a restart and will not work across " +
        "instances. Set SESSION_SECRET before deploying.",
    );
  }
  return globalThis.__ekmoolSessionSecret;
}

export interface Session {
  /** Verified at /track — never read from a request body. */
  email: string;
  /** Epoch seconds. */
  expiresAt: number;
}

interface TokenPayload {
  e: string;
  x: number;
}

function encode(payload: TokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** `<base64url payload>.<hex hmac>` — compact enough for a cookie, readable in a log. */
export function signSession(email: string, now = Date.now()): string {
  const body = encode({
    e: email.toLowerCase(),
    x: Math.floor(now / 1000) + MAX_AGE_SECONDS,
  });
  return `${body}.${hmacSha256Hex(body, resolveSecret())}`;
}

/**
 * Returns null for anything that is not a currently-valid token: wrong
 * shape, wrong signature, expired. The signature is checked before the
 * payload is trusted for anything at all.
 */
export function verifySession(token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!timingSafeEquals(signature, hmacSha256Hex(body, resolveSecret()))) {
    return null;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload?.e !== "string" || typeof payload?.x !== "number") return null;
  if (payload.x * 1000 <= now) return null;

  return { email: payload.e, expiresAt: payload.x };
}

/** The signed-in customer, or null. Safe to call from any server component. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

function cookieOptions() {
  return {
    httpOnly: true,
    // Lax, not Strict: a customer following the link in their confirmation
    // email arrives cross-site and must still be recognised.
    sameSite: "lax" as const,
    secure: appUrl.startsWith("https://"),
    path: "/",
  };
}

export function attachSession(response: NextResponse, email: string): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: signSession(email),
    maxAge: MAX_AGE_SECONDS,
    ...cookieOptions(),
  });
}

export function clearSession(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    maxAge: 0,
    ...cookieOptions(),
  });
}
