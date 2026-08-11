import { Storage } from "expo-sqlite/kv-store";

/**
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ WHAT MAY BE CACHED HERE, AND WHAT MAY NEVER BE.                      │
 * │                                                                      │
 * │ This cache holds the three static catalogue documents and nothing    │
 * │ else. **Nothing about checkout, orders, the account or the session   │
 * │ is ever cached — not now and not later.**                            │
 * │                                                                      │
 * │ The web enforces the same rule in its service worker, which excludes │
 * │ `/api`, `/checkout`, `/orders`, `/account`, `/admin` and `/track`,   │
 * │ and `pnpm --filter web test:offline` asserts it. The phone has no    │
 * │ equivalent enforcement, because the phone has no cache layer for     │
 * │ those paths at all — `src/api/client.ts` fetches them and returns    │
 * │ them, full stop. That is not an accident to be tidied up by adding   │
 * │ a general-purpose response cache "for consistency". It is the        │
 * │ mechanism.                                                           │
 * │                                                                      │
 * │ What a cached order looks like: a customer opens the app on a train, │
 * │ sees "confirmed" for an order that was cancelled and refunded two    │
 * │ days ago, and calls support about money they have already been sent. │
 * │ A cached session token outlives the sign-out that was supposed to    │
 * │ end it. Neither has a version of itself that is merely a bit stale.  │
 * │                                                                      │
 * │ Related, and equally not-an-oversight: **an order placed offline is  │
 * │ not queued.** There is no outbox in this app and there must not be   │
 * │ one. The web has `src/lib/offline-queue.ts`; replicating it here     │
 * │ means a customer believing an order exists when no server has heard  │
 * │ of it, on a device that may not be opened again for days. The        │
 * │ checkout button is disabled offline, with a sentence saying why.     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Storage is `expo-sqlite/kv-store` — already inside `expo-sqlite`, already
 * in the SDK, zero new native modules, and it has synchronous reads, which is
 * the entire reason `useCachedDocument` can render a warm start without a
 * spinner. `react-native-mmkv` was the rejected alternative: v4 needs
 * `react-native-nitro-modules`, a second native dependency, and the rule is
 * to ask before adding one — let alone two, to store a catalogue.
 *
 * The bodies stay as **strings**. They are parsed once on read into the
 * document type and never re-serialised, so a round trip through
 * `JSON.parse`/`JSON.stringify` cannot reorder a key and mint a false change.
 */

const PREFIX = "ekmool.doc.";

export interface CachedDocument {
  /** The raw JSON body, exactly as the server sent it. */
  body: string;
  /** The ETag it arrived with, or null if the response carried none. */
  etag: string | null;
}

/**
 * Body and validator under two keys rather than one JSON envelope.
 *
 * An envelope would mean `JSON.stringify`-ing the whole catalogue as a string
 * *inside* another JSON string — every quote escaped, the stored size up by
 * roughly a fifth, and a second parse on the synchronous read that has to
 * finish before the first frame. Two `getItemSync` calls cost two SQLite row
 * lookups.
 */
function bodyKey(key: string): string {
  return `${PREFIX}${key}`;
}

function etagKey(key: string): string {
  return `${PREFIX}${key}.etag`;
}

/**
 * The cached document, read **synchronously**.
 *
 * Synchronous is the point. This runs inside a `useState` initialiser so the
 * first frame of a warm start already has the catalogue in it. An async read
 * would put an empty frame — a spinner, or worse, an empty state — in front
 * of every customer who already has the data on their phone.
 */
export function readCachedDocument(key: string): CachedDocument | null {
  try {
    const body = Storage.getItemSync(bodyKey(key));
    if (body === null || body.length === 0) return null;
    return { body, etag: Storage.getItemSync(etagKey(key)) };
  } catch {
    // A corrupt or locked store reads as no cache, which is a state the hook
    // already handles. Throwing here would throw during render.
    return null;
  }
}

/**
 * Stores a freshly fetched body and its validator.
 *
 * Asynchronous, and not awaited by its caller: the document is already in
 * React state by the time this runs, so the write is for the *next* launch.
 * Blocking the current one on a hundred-kilobyte SQLite write would spend the
 * frame budget of the person who is here now on the convenience of the person
 * they will be tomorrow.
 *
 * The ETag is written **after** the body. If the process dies between the
 * two, the next launch finds a body with a stale-or-absent validator and
 * re-fetches — one wasted download. The other order would leave a new
 * validator over an old body, and the server would answer 304 to it forever.
 */
export async function writeCachedDocument(
  key: string,
  body: string,
  etag: string | null,
): Promise<void> {
  try {
    await Storage.setItemAsync(bodyKey(key), body);
    if (etag) {
      await Storage.setItemAsync(etagKey(key), etag);
    } else {
      await Storage.removeItemAsync(etagKey(key));
    }
  } catch {
    // Full or unwritable storage costs a cold start next launch and nothing
    // else. The alternative — surfacing it — would put a storage error in
    // front of a customer who can still browse perfectly well.
  }
}

/** Drops a document, e.g. after a body that would not parse. */
export async function clearCachedDocument(key: string): Promise<void> {
  try {
    await Storage.removeItemAsync(bodyKey(key));
    await Storage.removeItemAsync(etagKey(key));
  } catch {
    // See above.
  }
}
