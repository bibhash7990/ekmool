import { useCallback, useEffect, useRef, useState } from "react";

import { fetchDocument, type ApiFailure } from "@/api/client";
import {
  CATALOG_DOCUMENT,
  CONTENT_DOCUMENT,
  REVIEWS_DOCUMENT,
  type CatalogDocument,
  type ContentDocument,
  type ReviewsDocument,
} from "@/api/documents";
import {
  clearCachedDocument,
  readCachedDocument,
  writeCachedDocument,
} from "@/lib/document-cache";

/**
 * Cache-first reads of the three static catalogue documents.
 *
 * The shape of it — read the cache synchronously, render, then revalidate —
 * is the same shape as the web's hand-written service worker, and the reason
 * is the same one `docs/CONTRIBUTING.md` gives for not reaching for Workbox:
 * this is about eighty lines and every one of them is about a decision we
 * want to be able to see. TanStack Query was the rejected alternative (D6).
 * It is a good library. The catalogue is one document.
 *
 * ── The four states, and what a screen should draw for each ──
 *
 *   cold     Nothing cached and the first fetch is still in flight. The only
 *            state in which a spinner is honest, and it is reachable exactly
 *            once per install.
 *   stale    Cached data, not yet revalidated this session. Draw it. This is
 *            the warm start, and it must look identical to `fresh`.
 *   fresh    Revalidated against the server. Nothing to draw differently.
 *   offline  The last fetch failed. With `data` — draw the data, and a quiet
 *            banner if the screen has somewhere to put one. With `data: null`
 *            — the empty state, which says what is wrong and offers `refresh`.
 *            **Not a spinner that never resolves.**
 *
 * `error` is not in the plan's return type and is added deliberately: the
 * four states cannot tell "no network" from "the server answered 500", and
 * the copy rule is that a refusal names the rule that refused it. A screen
 * that wants to write an accurate sentence needs the failure, not a mood.
 */

export type CachedDocumentState = "cold" | "fresh" | "stale" | "offline";

export interface CachedDocumentResult<T> {
  data: T | null;
  state: CachedDocumentState;
  /** The last failure, cleared by any successful revalidation. */
  error: ApiFailure | null;
  refresh(): void;
}

interface Snapshot<T> {
  data: T | null;
  etag: string | null;
  state: CachedDocumentState;
  error: ApiFailure | null;
}

/**
 * RFC 9110's weak comparison, which is the one `If-None-Match` is defined to
 * use.
 *
 * Needed because the validator can be weakened in transit and still be the
 * same validator: nginx's gzip filter calls `ngx_http_weak_etag()`, so a
 * document served through `docker/nginx.conf` arrives as `W/"abc"` where the
 * origin wrote `"abc"`. Comparing the strings raw would treat every gzipped
 * response as changed and re-parse a catalogue that had not moved.
 */
function etagMatches(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.replace(/^W\//, "") === b.replace(/^W\//, "");
}

function seed<T>(key: string): Snapshot<T> {
  const cached = readCachedDocument(key);
  if (!cached) return { data: null, etag: null, state: "cold", error: null };

  try {
    return {
      data: JSON.parse(cached.body) as T,
      etag: cached.etag,
      state: "stale",
      error: null,
    };
  } catch {
    // A body that will not parse is a truncated write, not a document. Drop
    // it and start cold rather than keep re-reading it every launch.
    void clearCachedDocument(key);
    return { data: null, etag: null, state: "cold", error: null };
  }
}

export function useCachedDocument<T>(
  path: string,
  key: string,
): CachedDocumentResult<T> {
  // The lazy initialiser is the whole perceived-performance decision: the
  // cache read is synchronous, so a warm start's very first frame already has
  // the catalogue in it. **No spinner on a warm start.** Anything that makes
  // this read asynchronous — a promise, a native module without a sync API,
  // an `await` added for tidiness — puts an empty frame in front of every
  // returning customer and gives that frame back only when someone measures.
  const [snapshot, setSnapshot] = useState<Snapshot<T>>(() => seed<T>(key));
  const [attempt, setAttempt] = useState(0);

  // Re-seed when the document being asked for changes. In practice the three
  // descriptors are module constants and this never fires; it is here so the
  // hook is not quietly wrong for the first caller who passes a variable.
  const keyRef = useRef(key);
  if (keyRef.current !== key) {
    keyRef.current = key;
    setSnapshot(seed<T>(key));
  }

  // The ETag is read inside the effect but must not be one of its
  // dependencies — a new ETag would re-run the effect, which would fetch
  // again, which is a loop with a network request in it.
  const etagRef = useRef(snapshot.etag);
  etagRef.current = snapshot.etag;

  const refresh = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const result = await fetchDocument(path, etagRef.current, {
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!result.ok) {
        if (result.code === "CANCELLED") return;
        setSnapshot((prev) =>
          prev.state === "offline" && prev.error?.code === result.code
            ? prev
            : { ...prev, state: "offline", error: result },
        );
        return;
      }

      // Returning `prev` unchanged makes React bail out of the re-render
      // entirely. When the state does move (stale → fresh) the `data`
      // reference is preserved, so a FlatList does not re-key and memoised
      // children do not re-render — only the fact of freshness changes.
      const markFresh = () => {
        setSnapshot((prev) =>
          prev.state === "fresh" && prev.error === null
            ? prev
            : { ...prev, state: "fresh", error: null },
        );
      };

      // ── The 304 that may never come ──
      //
      // The origin cannot answer a conditional request itself. These routes
      // are `dynamic = "force-static"`, and Next hands such a handler a
      // request whose headers are an empty stub, so `If-None-Match` reads as
      // null there forever; when the ISR entry is fresh the handler is not
      // even invoked. The conditional is done by whatever is in front —
      // Vercel's CDN and the nginx edge profile both do it, and a bare
      // `next start` does not: it answers 200 with the full body every time.
      //
      // So the 304 is an optimisation this hook must be correct without. The
      // decision that matters — "nothing changed, do not re-render" — is the
      // ETag comparison below; the 304 is only the cheaper way to reach the
      // same conclusion, and it saves the bytes rather than the render.
      if (result.status === 304) {
        markFresh();
        return;
      }

      if (etagMatches(result.etag, etagRef.current)) {
        markFresh();
        return;
      }

      let parsed: T;
      try {
        parsed = JSON.parse(result.body) as T;
      } catch {
        // A 200 whose body is not JSON: keep whatever is already on screen and
        // do not cache it. `offline` even with no data, because `cold` means
        // "still trying" and would leave a first-launch screen on a spinner
        // that never resolves. The `error` says what actually happened, which
        // is why the screen has something honest to print.
        setSnapshot((prev) => ({
          ...prev,
          state: "offline",
          error: {
            ok: false,
            code: "INTERNAL_ERROR",
            message: "Something went wrong. Please try again.",
          },
        }));
        return;
      }

      setSnapshot({
        data: parsed,
        etag: result.etag,
        state: "fresh",
        error: null,
      });

      // Not awaited: the document is already in React state, so this write is
      // for the next cold start, not for this frame.
      void writeCachedDocument(key, result.body, result.etag);
    })();

    return () => {
      controller.abort();
    };
  }, [path, key, attempt]);

  return {
    data: snapshot.data,
    state: snapshot.state,
    error: snapshot.error,
    refresh,
  };
}

/* ------------------------------------------------------------------ */
/* The three documents, typed                                          */

/**
 * Thin wrappers so a screen cannot pair the catalogue's path with the
 * reviews' cache key, and so the document type is applied in one place
 * rather than restated at every call site.
 */
export function useCatalog(): CachedDocumentResult<CatalogDocument> {
  return useCachedDocument<CatalogDocument>(
    CATALOG_DOCUMENT.path,
    CATALOG_DOCUMENT.cacheKey,
  );
}

export function useReviews(): CachedDocumentResult<ReviewsDocument> {
  return useCachedDocument<ReviewsDocument>(
    REVIEWS_DOCUMENT.path,
    REVIEWS_DOCUMENT.cacheKey,
  );
}

export function useContent(): CachedDocumentResult<ContentDocument> {
  return useCachedDocument<ContentDocument>(
    CONTENT_DOCUMENT.path,
    CONTENT_DOCUMENT.cacheKey,
  );
}
