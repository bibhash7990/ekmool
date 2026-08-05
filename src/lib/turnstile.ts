import "server-only";

/**
 * Cloudflare Turnstile, plus the honeypot that works without it.
 *
 * **Why Turnstile and not reCAPTCHA.** It is free at any volume, it shows
 * real users no puzzle, it does not build an advertising profile out of the
 * people solving it, and it needs no npm dependency — a script tag and one
 * `fetch` from the server. Making a customer identify traffic lights before
 * they are allowed to buy turmeric is a tax on the wrong people.
 *
 * **Inert without keys.** No site key means no widget renders; no secret key
 * means `verifyTurnstile` returns `ok` without calling anyone. The
 * zero-third-party-key deployment is unaffected, which is the whole
 * project's constraint.
 *
 * **The honeypot is not a fallback, it is the floor.** It runs whether or
 * not Turnstile is configured, costs nothing, and catches the naive form
 * bots that make up most of the noise.
 *
 * There is deliberately **no timing check** here, though one was planned.
 * The idea is that a form submitted implausibly fast was not filled by a
 * human — but a returning customer using browser autofill submits a
 * checkout in well under a second, and the cost of wrongly refusing a real
 * order is worse than the cost of letting a bot through to a rate limiter
 * that is already watching. The honeypot catches the same class of bot with
 * no such risk.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileSiteKey: string =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

const turnstileSecret: string = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";

/** Configured means both halves. One without the other is a misconfiguration. */
export const hasTurnstile: boolean =
  turnstileSiteKey.length > 0 && turnstileSecret.length > 0;

export type ChallengeResult =
  | { ok: true }
  | { ok: false; reason: "honeypot" | "missing_token" | "rejected" };

/**
 * Was this submission filled in by a person?
 *
 * Order matters. The honeypot is checked first because it is free and
 * local; only then do we spend a network round trip on Turnstile.
 */
export async function verifyChallenge(params: {
  honeypot: unknown;
  token: unknown;
  ip?: string | null;
}): Promise<ChallengeResult> {
  // Any value at all. A human cannot type into this field: it is hidden
  // from the layout, from the tab order, and from assistive technology.
  if (typeof params.honeypot === "string" && params.honeypot.trim() !== "") {
    return { ok: false, reason: "honeypot" };
  }

  if (!hasTurnstile) return { ok: true };

  if (typeof params.token !== "string" || params.token === "") {
    return { ok: false, reason: "missing_token" };
  }

  const body = new URLSearchParams({
    secret: turnstileSecret,
    response: params.token,
  });
  if (params.ip) body.set("remoteip", params.ip);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      // Cloudflare being slow must not hold a checkout open indefinitely.
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Cloudflare is having a bad day. Failing closed here would take the
      // shop down with them; the rate limiter and the honeypot still apply.
      console.warn(`[turnstile] siteverify returned ${response.status}`);
      return { ok: true };
    }

    const data = (await response.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: "rejected" };
  } catch (error) {
    console.warn("[turnstile] siteverify unreachable", error);
    return { ok: true };
  }
}
