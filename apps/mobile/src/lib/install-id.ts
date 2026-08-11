import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { INSTALL_ID_PATTERN } from "@ekmool/contracts/headers";

/**
 * The install id sent as `X-Ekmool-Install`.
 *
 * **What it is not.** It is generated here, on the device, by code the
 * customer's phone runs — so anyone who wants a fresh one per request can
 * have one. It is **not a security boundary** and must never be described as
 * one, in code, in a comment, or in a design document. Nothing that must be
 * unforgeable — who a customer is, what an order costs — may ever be derived
 * from it. The server's own comment in `apps/web/src/lib/rate-limit.ts` says
 * the same thing, and the security boundary stays where it was: the outer IP
 * bucket, plus the fact that `/api/v1/session` needs a reference and an email
 * that cannot be guessed at any rate the limiter permits.
 *
 * **What it is.** A fairness mechanism for carrier NAT. `limitsFor()` gives
 * `/api/account/lookup` five requests a minute keyed on the forwarded IP, and
 * an Indian mobile carrier puts a very large number of subscribers behind one
 * address. Two customers on the same network looking up their orders in the
 * same minute is not hypothetical, and without this the second one is told
 * "too many requests" after making exactly one. With it, the limiter keys the
 * tight bucket on the install and leaves a looser one on the IP.
 *
 * 16 bytes as 32 lowercase hex characters, matching `INSTALL_ID_PATTERN`
 * exactly. A value that does not match is treated by the server as absent —
 * silently, with the request falling back to the IP bucket — so the pattern
 * is asserted here on read as well as on mint. `randomUUID()` was the
 * rejected alternative: it is the same 16 bytes, but it arrives with dashes
 * and a version nibble, so it would have needed stripping and would then no
 * longer be a UUID in any sense worth the name.
 */

/**
 * SecureStore rather than `kv-store`, for one narrow reason: this value must
 * survive an app update and must not be trivially editable, and the keystore
 * gives both. It is *not* here because it is a secret — it is not one.
 */
const STORAGE_KEY = "ekmool.install-id";

/**
 * Cached for the life of the process. Every request needs this, and a
 * Keychain read per request is a bridge hop for a value that cannot change.
 */
let cached: string | null = null;

/** In-flight mint, so two concurrent first requests do not mint two ids. */
let pending: Promise<string | null> | null = null;

function mint(): string {
  // `getRandomBytes`, the synchronous form: 16 bytes off the platform CSPRNG
  // is not a computation worth a promise, and the async form only exists for
  // platforms where it is.
  const bytes = Crypto.getRandomBytes(16);
  // Array.from rather than a for..of over the Uint8Array, which needs
  // downlevel iteration to compile to something that is not a surprise.
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolve(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (stored && INSTALL_ID_PATTERN.test(stored)) {
      cached = stored;
      return stored;
    }

    const minted = mint();
    await SecureStore.setItemAsync(STORAGE_KEY, minted);
    cached = minted;
    return minted;
  } catch {
    // The keystore can be unavailable — a device with no secure hardware and
    // no passcode, a corrupt Keychain entry after a restore. Returning null
    // rather than throwing is deliberate: without the header the server keys
    // the request on the IP exactly as it does for a browser, which is a
    // worse rate-limit share and a working app. Failing the request instead
    // would turn a fairness optimisation into a hard dependency, which is
    // precisely what the paragraph at the top says it is not.
    return null;
  }
}

/**
 * The install id, minting and storing one on first launch.
 *
 * Never throws and never rejects. Null means "send no header".
 */
export async function getInstallId(): Promise<string | null> {
  if (cached) return cached;
  pending ??= resolve().finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * The id if it has already been read this session, without touching the
 * keystore. Null both when there is none and when nobody has looked yet, so
 * it is only ever an optimisation — callers that need the value must await
 * `getInstallId`.
 */
export function peekInstallId(): string | null {
  return cached;
}
