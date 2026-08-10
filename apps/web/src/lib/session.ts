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
 *
 * Which is also why the same token can be handed to a client that has no
 * cookie jar. `POST /api/v1/session` takes the identical proof and returns
 * the identical token in a JSON body, for a phone to keep in its keystore
 * and send as `Authorization: Bearer …`; `resolveSession` reads either
 * door. There is one token format, one secret and one expiry rule, and the
 * transport is the only thing that differs.
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

/**
 * The bearer token from an Authorization header, or undefined.
 *
 * The scheme is matched case-insensitively because RFC 7235 says it is
 * case-insensitive, and an HTTP client library that title-cases or
 * lower-cases it on the way out is not misbehaving. The token itself is
 * returned untouched — it is base64url and hex, and trimming anything off
 * the inside of it would break a signature rather than repair one.
 */
export function bearerToken(headers: Headers): string | undefined {
  const header = headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header.trim());
  return match?.[1];
}

/**
 * The signed-in customer, from either door.
 *
 * A browser sends the httpOnly cookie. A native client has no cookie jar
 * worth relying on, so it sends the same signed token as a bearer header
 * and holds it in the platform keystore. Both verify through
 * `verifySession`: there is one signature, one secret and one expiry rule,
 * and deliberately no second token format — a second format would mean a
 * second place for the expiry rule to be wrong.
 *
 * `headers` is optional so that this is a safe rename of `getSession()`
 * rather than a behaviour change. Called with no argument — which is what
 * every server component does — it reads the cookie and nothing else, so no
 * existing call site changes meaning by adopting it.
 *
 * A bearer token that fails verification falls through to the cookie rather
 * than refusing outright. That keeps a browser sending some unrelated
 * Authorization header (a proxy, a debugging tool) working exactly as it
 * does today; a native client has no cookie to fall back to, so it gets the
 * 401 its expired token earned either way.
 */
export async function resolveSession(headers?: Headers): Promise<Session | null> {
  if (headers) {
    const session = verifySession(bearerToken(headers));
    if (session) return session;
  }
  return getSession();
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
  // Deleted twice, once with Secure and once without.
  //
  // A cookie is cleared only by a Set-Cookie whose attributes match the one
  // that created it, and `secure` here is derived from NEXT_PUBLIC_APP_URL.
  // Leave that unset on an HTTPS deployment — which is easy, because the
  // URL is not known until the first deploy has already happened — and the
  // session is written by the browser as Secure (it arrived over HTTPS) but
  // cleared without it. The two do not match, the cookie survives, and
  // signing out silently does nothing: the customer stays signed in and
  // their orders stay visible on a shared machine.
  //
  // Sending both costs one header and removes the dependency on
  // configuration being right.
  // Appended as raw headers rather than through response.cookies.set,
  // which keys by cookie name — setting it twice replaces the first rather
  // than emitting both.
  const base = `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
  response.headers.append("set-cookie", base);
  response.headers.append("set-cookie", `${base}; Secure`);
}
