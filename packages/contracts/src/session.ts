import { z } from "zod";
import type { ApiErrorResponse, ValidationFailedResponse } from "./responses";

/**
 * `POST /api/v1/session` — the bearer door into an account.
 *
 * The proof is exactly the proof `/api/account/lookup` asks a browser for:
 * the eight-character order reference and the address the order was placed
 * with. What differs is only the transport. A browser is handed an
 * `httpOnly` cookie; a native client has no cookie jar worth relying on, so
 * it is handed the same signed token in the body and keeps it in the
 * platform keystore.
 *
 * The rules below are duplicated from the server's own lookup schema on
 * purpose, so the phone can refuse an obviously wrong reference before it
 * spends a round trip on a network it is paying for by the megabyte. The
 * server re-validates regardless; this is for the message, never for the
 * decision.
 */

/**
 * Accept the eight-character reference as printed, or a full 26-character
 * ULID pasted out of a link. Spaces and a leading `#` are what people
 * actually type, and Crockford base32 has no I, L, O or U — so a reference
 * that contains one is a typo, not a reference.
 */
export const orderReferenceSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s#-]/g, "").toUpperCase())
  .refine(
    (value) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(value) || /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value),
    { message: "Enter the 8-character order reference from your confirmation" },
  );

export const sessionRequestSchema = z.object({
  reference: orderReferenceSchema,
  email: z.email("Enter the email address you ordered with").max(200),
});

export type SessionRequest = z.infer<typeof sessionRequestSchema>;

/**
 * 200. The token is the same `<base64url payload>.<hex hmac>` the web puts
 * in its session cookie — one signature, one secret, one expiry rule.
 *
 * `expiresAt` is **epoch seconds**, matching the expiry the server already
 * carries inside the token, not milliseconds. A client that multiplies by
 * 1000 twice signs its customer out in 1970; one that never multiplies
 * keeps a dead token for thirty days.
 *
 * `email` is the normalised (trimmed, lower-cased) address that matched, so
 * a client can display it without re-deriving it.
 */
export interface SessionResponse {
  token: string;
  email: string;
  expiresAt: number;
}

/**
 * 404 with `LOOKUP_FAILED` for every miss — wrong reference, wrong email,
 * or a real reference under somebody else's address. One body and one
 * status for all three, because a distinguishable failure tells a prober
 * which references exist. Shaped identically to
 * `AccountLookupErrorResponse`, which is the same door for a browser.
 */
export type SessionErrorResponse =
  | ValidationFailedResponse
  | (ApiErrorResponse & {
      code: "LOOKUP_FAILED" | "BAD_REQUEST" | "DB_UNAVAILABLE" | "INTERNAL_ERROR";
    });

/**
 * How the token goes back on every subsequent request:
 * `Authorization: Bearer <token>`.
 *
 * A helper rather than a template literal at each call site so the single
 * space stays a single space — the server's matcher tolerates extra
 * whitespace and a different case for the scheme, but nothing tolerates the
 * token itself being padded, and building the value in one place is how it
 * stays unpadded.
 */
export function bearerHeaderValue(token: string): string {
  return `Bearer ${token}`;
}
