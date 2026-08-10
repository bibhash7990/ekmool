/**
 * Ekmool service worker. Hand-written, no build step, no Workbox.
 *
 * India is why this exists. A shopper on a train between Bengaluru and
 * Mysuru loses signal every few minutes; a shopper on a 3G connection in a
 * lift loses it for thirty seconds. Neither should see a dinosaur, and
 * neither should lose a cart.
 *
 * Four strategies, chosen per resource because there is no single right
 * one:
 *
 *   /_next/static/*   cache-first, forever. The filenames are content
 *                     hashes, so a stale one is impossible by construction
 *                     — a changed file is a different URL.
 *   images            stale-while-revalidate. An old photograph of the
 *                     right product beats a spinner.
 *   navigations       network-first with a short timeout, then cache, then
 *                     the offline page. Never cache-first: a price or a
 *                     stock line served from last week is worse than a
 *                     wait, and this is a shop.
 *   everything else   straight to the network, uncached.
 *
 * What is never touched: anything under /api, anything that is not a GET,
 * /admin, /checkout, /orders, /account and /track. Those are either
 * mutations or somebody's personal data, and the Cache API is
 * origin-scoped storage that survives the tab — a cached order page is a
 * privacy leak on a shared computer, and a cached checkout is a stale
 * price.
 */

const VERSION = "v1";
const STATIC_CACHE = `ekmool-static-${VERSION}`;
const PAGE_CACHE = `ekmool-pages-${VERSION}`;
const IMAGE_CACHE = `ekmool-images-${VERSION}`;
const OFFLINE_URL = "/offline";

/** Give the network this long before falling back. Longer feels broken. */
const NETWORK_TIMEOUT_MS = 3500;

/** Bounded, so a long browse cannot fill a phone. */
const PAGE_CACHE_LIMIT = 40;
const IMAGE_CACHE_LIMIT = 60;

/**
 * Never cached, at any layer. Personal, transactional, or both.
 *
 * /checkout is on the list for a different reason from the others: it is
 * not private so much as time-sensitive. A cached checkout page could show
 * a price that has changed, and the customer would be right to be annoyed.
 */
const NEVER_CACHE = [
  "/api/",
  "/admin",
  "/checkout",
  "/orders",
  "/order/",
  "/account",
  "/track",
  "/newsletter/",
];

function isNeverCached(pathname) {
  return NEVER_CACHE.some((prefix) => pathname.startsWith(prefix));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // Only the offline page and the brand mark. Precaching the whole
        // catalogue would download several hundred kilobytes to a phone
        // that may never come back, on the install of a site somebody
        // visited once.
        cache.addAll([OFFLINE_URL, "/brand/ekmool-mark.svg"]),
      )
      // A failed precache must not leave a half-installed worker. Swallow
      // it: the fetch handlers all degrade to the network anyway.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("ekmool-") && !name.endsWith(VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Oldest-first eviction. Insertion order is what the Cache API preserves. */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
        await trim(cacheName, limit);
      }
      return response;
    })
    .catch(() => cached);

  return cached ?? network;
}

/**
 * Network-first, with a timeout rather than a plain race to failure.
 *
 * `fetch` on a connection that has dropped but not been detected — a train
 * tunnel, a lift — does not reject, it hangs. Without the timer the page
 * would appear to load forever with a perfectly good copy sitting in the
 * cache.
 */
async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("slow")), NETWORK_TIMEOUT_MS),
      ),
    ]);

    if (response.ok) {
      await cache.put(request, response.clone());
      await trim(PAGE_CACHE, PAGE_CACHE_LIMIT);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response("You are offline.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET. A POST is a mutation, and replaying one from a cache would
  // be placing somebody's order twice.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url.pathname)) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (
    request.destination === "image" ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/brand/")
  ) {
    event.respondWith(
      staleWhileRevalidate(request, IMAGE_CACHE, IMAGE_CACHE_LIMIT),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

/* ------------------------------------------------------------------ */
/* Orders submitted while offline                                      */

/**
 * The queue lives in IndexedDB, written by the checkout page and drained
 * here.
 *
 * Replaying a checkout is only safe because every order carries an
 * Idempotency-Key and the orders table has a unique index on it. A replay
 * that arrives twice — Background Sync firing while the page also retries
 * — creates one order, not two. That guarantee was built in M3 for a
 * different reason and is what makes this feature defensible at all;
 * without it, queueing a payment request would be reckless.
 *
 * What is deliberately NOT attempted: telling the customer here. A service
 * worker has no UI, and asking for notification permission to report an
 * order status is a bargain nobody wants. The result is written back to
 * IndexedDB and the site reports it the next time they open it.
 */
const DB_NAME = "ekmool-offline";
const DB_VERSION = 1;
const STORE = "outbox";

function openDb() {
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

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const result = run(store);
    transaction.oncomplete = () => resolve(result.result ?? result);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function drainOutbox() {
  let db;
  try {
    db = await openDb();
  } catch {
    return;
  }

  const pending = await tx(db, "readonly", (store) => store.getAll());
  const entries = Array.isArray(pending) ? pending : [];

  for (const entry of entries) {
    if (entry.state !== "pending") continue;

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": entry.idempotencyKey,
        },
        body: JSON.stringify(entry.payload),
      });

      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        entry.state = "placed";
        entry.orderId = body.orderId ?? null;
      } else if (response.status >= 500 || response.status === 429) {
        // Ours, or a throttle. Leave it pending and let the next sync try.
        continue;
      } else {
        // A 4xx is a decision, not a blip: out of stock, a coupon that
        // expired, a validation failure. Retrying cannot fix it, and
        // retrying forever would hide it.
        entry.state = "failed";
        entry.reason = body.error ?? `Refused (${response.status})`;
      }

      entry.resolvedAt = Date.now();
      await tx(db, "readwrite", (store) => store.put(entry));
    } catch {
      // Still offline. Stop — the rest will fail the same way.
      return;
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "ekmool-outbox") {
    event.waitUntil(drainOutbox());
  }
});

/**
 * Safari and Firefox do not implement Background Sync, so the page asks
 * directly when it regains connectivity. Same drain either way.
 */
self.addEventListener("message", (event) => {
  if (event.data?.type === "drain-outbox") {
    event.waitUntil(drainOutbox());
  }
});
