import {
  sessionRequestSchema,
  type SessionResponse,
} from "@ekmool/contracts/session";

import { apiPost, type ApiResult } from "@/api/client";
import { clearSession, saveSession } from "@/lib/session";

/**
 * The one door into an account: `POST /api/v1/session`.
 *
 * There is no registration and there must never be one (rule 7). The proof is
 * the eight-character order reference printed on the confirmation plus the
 * address the order was placed with — the same proof `/api/account/lookup`
 * asks a browser for. What differs is only the transport: a browser gets an
 * httpOnly cookie, this gets the same signed token in the body and puts it in
 * the keystore.
 */

/**
 * Validates locally first, with the schema the server uses.
 *
 * Not to make the decision — the server re-validates everything and its answer
 * is the only one that counts — but for the message, and for the round trip.
 * The customer is on a connection they pay for by the megabyte; a reference
 * with an `O` in it (Crockford base32 has no I, L, O or U, so an O is a typo)
 * can be refused here in the time it takes to type the next character.
 *
 * The schema also *normalises*: it strips spaces, `#` and dashes and
 * upper-cases, which is what people actually paste. So the parsed value is
 * sent, never the raw input.
 */
export type SignInResult = ApiResult<SessionResponse>;

export async function signIn(
  reference: string,
  email: string,
): Promise<SignInResult> {
  const parsed = sessionRequestSchema.safeParse({ reference, email });

  if (!parsed.success) {
    // Shaped exactly like the server's 422 so the screen has one branch, not
    // two. `VALIDATION_FAILED` is the code the server would have sent, and
    // the message is the schema's own — the schema carries the wording
    // precisely so both ends refuse in the same words.
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: first?.message ?? "Please check the highlighted fields",
      payload: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  const result = await apiPost<SessionResponse>("/api/v1/session", parsed.data);

  if (!result.ok) return result;

  // Stored before returning, so a caller cannot navigate to an account screen
  // that then makes an unauthenticated request. One failure mode disappears
  // by ordering rather than by everyone remembering.
  await saveSession(result.data);
  return result;
}

/**
 * Signs out by deleting the token.
 *
 * There is no server call. The token is stateless — a signed payload the
 * server verifies rather than a row it looks up — so there is nothing to
 * revoke, and inventing a revocation endpoint would mean inventing the
 * session table that the whole design does without. What the customer asked
 * for is that this device stops being signed in, and deleting the credential
 * from the keystore is exactly that.
 */
export async function signOut(): Promise<void> {
  await clearSession();
}
