/**
 * The outbox: an order submitted while the connection was gone.
 *
 * Client-side only, and imported only by the checkout and the page that
 * reports on it — never from the root layout. The four pages this site is
 * held to a JavaScript budget on (home, shop, a product, a journal post)
 * must not carry a byte of it.
 *
 * The record shape here is a contract with `public/sw.js`, which drains the
 * same store from the service worker. Change one and change the other.
 *
 * **Only Cash on Delivery is ever queued.** A prepaid order needs the
 * Razorpay modal, which needs the network, and holding one for later would
 * mean placing an unpaid order and hoping. COD has no such step: the
 * request is the whole transaction.
 *
 * Replaying a checkout is safe here and would not be anywhere else. Every
 * order carries an Idempotency-Key with a unique index behind it, so a
 * replay that races the page's own retry produces one order rather than
 * two. That was built in M3 for a different reason, and it is the only
 * reason this feature is defensible.
 */

const DB_NAME = "ekmool-offline";
const DB_VERSION = 1;
const STORE = "outbox";

export type OutboxState = "pending" | "placed" | "failed";

export interface OutboxEntry {
  id: string;
  idempotencyKey: string;
  /** The exact body that would have been POSTed to /api/checkout. */
  payload: unknown;
  /**
   * For the summary shown to the customer — never re-sent, and read only
   * by /order/queued. The lines matter on the unhappy path: an order
   * refused for stock leaves an empty basket, and "add these three things
   * again" is only useful if we remember what they were.
   */
  summary: {
    total: number;
    itemCount: number;
    email: string;
    lines: { name: string; pack: string; qty: number }[];
  };
  state: OutboxState;
  createdAt: number;
  resolvedAt?: number;
  orderId?: string | null;
  reason?: string;
}

function supported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

/**
 * Holds an order and asks the service worker to send it when it can.
 *
 * Returns false if the browser cannot do this — no IndexedDB, or no
 * service worker — in which case the caller must say so plainly rather
 * than claim the order is safe. A promise the software cannot keep is
 * worse than an error message.
 */
export async function queueOrder(entry: {
  idempotencyKey: string;
  payload: unknown;
  summary: OutboxEntry["summary"];
}): Promise<boolean> {
  if (!supported()) return false;

  const record: OutboxEntry = {
    id: entry.idempotencyKey,
    idempotencyKey: entry.idempotencyKey,
    payload: entry.payload,
    summary: entry.summary,
    state: "pending",
    createdAt: Date.now(),
  };

  try {
    await run("readwrite", (store) => store.put(record));
  } catch {
    return false;
  }

  await requestDrain();
  return true;
}

/**
 * Nudges the service worker to try the outbox.
 *
 * Background Sync first — it is the only mechanism that fires after the tab
 * is closed, which is the case that matters, because somebody who has just
 * been told "we will send this when you are back" will close the tab.
 * Safari and Firefox do not implement it, so a plain message is the
 * fallback and the page also calls this on the `online` event.
 */
export async function requestDrain(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const sync = (
      registration as ServiceWorkerRegistration & {
        sync?: { register(tag: string): Promise<void> };
      }
    ).sync;

    if (sync) {
      await sync.register("ekmool-outbox");
      return;
    }

    registration.active?.postMessage({ type: "drain-outbox" });
  } catch {
    // Not registered yet, or permission refused. The `online` listener on
    // the reporting page will try again.
  }
}

export async function readOutbox(): Promise<OutboxEntry[]> {
  if (!supported()) return [];
  try {
    const all = await run<OutboxEntry[]>("readonly", (store) => store.getAll());
    return (all ?? []).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function forgetEntry(id: string): Promise<void> {
  if (!supported()) return;
  try {
    await run("readwrite", (store) => store.delete(id));
  } catch {
    // Nothing to do — it is a local record of something already resolved.
  }
}

export async function countPending(): Promise<number> {
  const entries = await readOutbox();
  return entries.filter((entry) => entry.state === "pending").length;
}
