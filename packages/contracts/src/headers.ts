/**
 * The two headers a native client sends on every request.
 *
 * Deliberately in a module of its own with no imports at all. Both are read
 * inside `src/proxy.ts`, which runs on every /api request; anything it
 * imports is bundled into that hop, and a constant should not drag Zod
 * along behind it.
 *
 * **Neither is a credential.** Both are chosen by the client, so anything
 * that must not be forgeable — who a customer is, what an order costs — is
 * derived from the signed session or from rows the server holds a lock on,
 * never from these. See docs/SECURITY.md.
 */

/**
 * `mobile/1.4.0 (android; build 41)`
 *
 * What makes `minClientBuild` enforceable, and what lets a log line say
 * which build hit a bug. Its presence is also how a request declares itself
 * native — which buys it a way past the Turnstile it cannot solve, and
 * costs it a far lower volume ceiling than a browser gets. That trade is
 * the whole point and is written up in docs/SECURITY.md.
 */
export const CLIENT_HEADER = "x-ekmool-client";

/**
 * 32 hex characters, generated once on first launch and kept in the
 * platform keystore.
 *
 * A fairness mechanism for carrier NAT, not a security boundary: a
 * determined caller mints a fresh one per request. Its job is that two
 * honest customers behind one mobile carrier's address do not take each
 * other's rate-limit tokens.
 */
export const INSTALL_HEADER = "x-ekmool-install";

/** The shape the server will accept. Anything else is treated as absent. */
export const INSTALL_ID_PATTERN = /^[0-9a-f]{32}$/;

/** A parsed `X-Ekmool-Client`, or null when the header is missing or junk. */
export interface ClientIdentity {
  /** `mobile`, `web`, or whatever a future client calls itself. */
  platform: string;
  /** Semver as sent, unvalidated — for logs only. */
  version: string;
  /** The integer build number, or 0 when the header did not carry one. */
  build: number;
}

/**
 * Parse `X-Ekmool-Client`. Never throws; a malformed header is null, which
 * every caller must treat as "an ordinary browser".
 */
export function parseClientHeader(value: string | null | undefined): ClientIdentity | null {
  if (!value) return null;
  const match = /^([a-z][a-z0-9-]{0,15})\/(\d+\.\d+\.\d+)(?:\s*\(([^)]{0,60})\))?$/i.exec(
    value.trim(),
  );
  if (!match) return null;

  const [, platform, version, detail] = match;
  const build = Number(/build\s+(\d+)/i.exec(detail ?? "")?.[1] ?? 0);

  return {
    platform: platform.toLowerCase(),
    version,
    // Number("") is 0 and Number(undefined) is NaN; the ?? 0 above covers
    // the second, and this covers a build number too large to be a build
    // number. A client that cannot state its build is treated as build 0,
    // which fails every minClientBuild check — the safe direction.
    build: Number.isSafeInteger(build) && build >= 0 ? build : 0,
  };
}

/** True when the request declares itself a native client. */
export function isNativeClient(value: string | null | undefined): boolean {
  const client = parseClientHeader(value);
  return client !== null && client.platform !== "web";
}
