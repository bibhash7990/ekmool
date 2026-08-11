import * as SecureStore from "expo-secure-store";
import type { SessionResponse } from "@ekmool/contracts/session";

/**
 * The bearer token from `POST /api/v1/session`, and where it lives.
 *
 * **`expo-secure-store`, never `expo-sqlite/kv-store`.** The token is a
 * thirty-day credential for someone's order history and address. SecureStore
 * is the Keychain on iOS and EncryptedSharedPreferences on Android;
 * `kv-store` is a plain SQLite file inside the app's data directory, which on
 * a rooted or jailbroken handset — or on any handset with an ADB backup — is
 * a file somebody can read. The cart lives in `kv-store` precisely because it
 * is worth nothing to anyone; this is not the cart.
 *
 * Sign-out deletes it. A 401 deletes it (see `src/api/client.ts`), because a
 * token the server has stopped accepting is not a session, and retrying with
 * it is the loop that made this rule worth writing down.
 *
 * ---
 *
 * **Expiry is the server's number, not ours.** `expiresAt` is read back out
 * of the token the server just signed and is in **epoch seconds**. The client
 * does not compute thirty days from `Date.now()` and it does not convert:
 * multiply by 1000 twice and the customer is signed out in 1970; never
 * multiply and a dead token is kept for a month. One conversion, in
 * `hasExpired` below, and nowhere else.
 */

const STORAGE_KEY = "ekmool.session";

/**
 * Exactly the 200 body of `POST /api/v1/session`.
 *
 * Aliased from the contract rather than re-declared so that a field added
 * there arrives here rather than being silently dropped on write.
 */
export type StoredSession = SessionResponse;

let cached: StoredSession | null = null;
let loaded = false;

type SessionListener = (session: StoredSession | null) => void;
const listeners = new Set<SessionListener>();

function publish(session: StoredSession | null): void {
  cached = session;
  loaded = true;
  for (const listener of listeners) listener(session);
}

/** The one place epoch seconds become milliseconds. */
function hasExpired(session: StoredSession): boolean {
  return session.expiresAt * 1000 <= Date.now();
}

function parse(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.token !== "string" ||
      record.token.length === 0 ||
      typeof record.email !== "string" ||
      typeof record.expiresAt !== "number" ||
      !Number.isFinite(record.expiresAt)
    ) {
      return null;
    }
    return { token: record.token, email: record.email, expiresAt: record.expiresAt };
  } catch {
    // Corrupt storage reads as signed out, which is a screen the app already
    // has. Throwing here would throw during the first render after a restore.
    return null;
  }
}

/**
 * The stored session, or null when there is none or it has expired.
 *
 * An expired token is deleted rather than returned, so the keystore does not
 * keep a dead credential around for a customer who never opens the app again.
 */
export async function loadSession(): Promise<StoredSession | null> {
  if (loaded) return cached;

  let stored: StoredSession | null = null;
  try {
    stored = parse(await SecureStore.getItemAsync(STORAGE_KEY));
  } catch {
    stored = null;
  }

  if (stored && hasExpired(stored)) {
    await clearSession();
    return null;
  }

  publish(stored);
  return stored;
}

/** Stores the token returned by `POST /api/v1/session`. */
export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
  publish(session);
}

/**
 * Deletes it. Called by sign-out and by the 401 path.
 *
 * The delete is attempted even if it throws, and the in-memory copy is
 * dropped either way: a session the app keeps using because the keystore
 * refused to forget it is the worse of the two failures.
 */
export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Ignored on purpose — see above.
  }
  publish(null);
}

/**
 * The session as last read, without touching the keystore. Null before
 * anything has called `loadSession`, so it is an optimisation and not a
 * source of truth.
 */
export function peekSession(): StoredSession | null {
  return loaded ? cached : null;
}

/**
 * Notified whenever the session is stored or cleared — including the clear
 * the API client performs on a 401.
 *
 * This exists so a 401 four screens deep can return the app to the lookup
 * screen. The rejected alternative was for every caller to check the failure
 * code and navigate itself: that works until one caller forgets, and the
 * symptom of forgetting is a screen that quietly shows nothing for a customer
 * who is no longer signed in.
 *
 * Returns its own unsubscribe, so a `useEffect` can return it directly.
 */
export function subscribeToSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
