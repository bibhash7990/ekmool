"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  readOutbox,
  requestDrain,
  forgetEntry,
  type OutboxEntry,
} from "@/lib/offline-queue";
import { formatPaise } from "@/lib/money";

/**
 * What happened to an order submitted while the connection was gone.
 *
 * The service worker sends it and writes the result back to IndexedDB; it
 * has no way to tell anybody, because a worker has no interface and asking
 * for notification permission to report an order status is a bargain
 * nobody wants. So this reads the same store and reports.
 *
 * It polls, at four seconds. Reaching for BroadcastChannel would be more
 * elegant and would need a second code path in the worker for a page that
 * is, by construction, open and being watched by someone waiting for an
 * answer. Four seconds is imperceptible to them and free to us.
 *
 * Renders nothing when the outbox is empty, which is almost always, so it
 * can sit on /track without being in the way.
 */
export function QueuedOrders({ standalone = false }: { standalone?: boolean }) {
  const [entries, setEntries] = useState<OutboxEntry[] | null>(null);

  const refresh = useCallback(async () => {
    setEntries(await readOutbox());
  }, []);

  useEffect(() => {
    let live = true;

    const load = () => {
      void readOutbox().then((next) => {
        // The component can unmount between the read starting and the
        // rows arriving — IndexedDB is asynchronous and the reader may
        // navigate away mid-poll.
        if (live) setEntries(next);
      });
    };

    // The first read is scheduled rather than called here. Reading a
    // store is subscribing to an external system, and every setState in
    // this effect should come from that subscription's callbacks — not
    // from the effect body, which would cascade a render on mount.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 4000);

    // The moment the connection returns, ask the worker to try. Background
    // Sync does this on its own in Chrome; Safari and Firefox have no such
    // thing, and this is the whole of their story.
    const onOnline = () => {
      void requestDrain().then(load);
    };
    addEventListener("online", onOnline);

    return () => {
      live = false;
      removeEventListener("online", onOnline);
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  if (entries === null) {
    return standalone ? (
      <p className="mt-6 text-17 text-ek-green-700">Checking…</p>
    ) : null;
  }
  if (entries.length === 0) {
    return standalone ? (
      <div className="mt-6">
        <p className="max-w-[60ch] text-17 text-ek-green-700">
          Nothing is waiting to be sent from this device.
        </p>
        <p className="mt-6 text-17">
          <Link href="/track" className="link-draw text-ek-green-900">
            Find an order
          </Link>
        </p>
      </div>
    ) : null;
  }

  return (
    <section
      aria-labelledby="queued-heading"
      className={standalone ? "mt-8" : "mt-12 border-t border-ek-green-200 pt-8"}
    >
      <h2
        id="queued-heading"
        className="font-display text-26 text-ek-green-900"
      >
        {standalone ? "Held on this device" : "An order held on this device"}
      </h2>

      <ul className="mt-6 flex flex-col">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="border-b border-ek-green-200 py-5 last:border-b-0"
          >
            <p className="text-15 text-ek-green-700">
              {entry.summary.itemCount} item
              {entry.summary.itemCount === 1 ? "" : "s"} ·{" "}
              {formatPaise(entry.summary.total)} · {entry.summary.email}
            </p>

            {entry.state === "pending" && (
              <>
                <p className="mt-2 max-w-[62ch] text-17 text-ek-green-900">
                  Waiting to be sent. It is stored in this browser and has{" "}
                  <strong className="font-medium">not been placed yet</strong>{" "}
                  — we will send it the moment you are back online, even if
                  you close this tab.
                </p>
                <p className="mt-2 text-15 text-ek-green-700">
                  Nothing has been charged. It is Cash on Delivery, so
                  nothing will be until a courier hands it to you.
                </p>
              </>
            )}

            {entry.state === "placed" && (
              <>
                <p className="mt-2 max-w-[62ch] text-17 text-ek-green-900">
                  Sent, and accepted. Your reference is{" "}
                  <strong className="font-medium tabular-nums">
                    {entry.orderId?.slice(-8).toUpperCase() ?? "—"}
                  </strong>
                  .
                </p>
                <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-17">
                  {entry.orderId && (
                    <Link
                      href={`/order/${entry.orderId}/confirmed`}
                      className="link-draw text-ek-green-900"
                    >
                      See the order
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      void forgetEntry(entry.id).then(refresh);
                    }}
                    className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4 hover:text-ek-gold-800"
                  >
                    Clear this from my device
                  </button>
                </p>
              </>
            )}

            {entry.state === "failed" && (
              <>
                <p className="mt-2 max-w-[62ch] text-17 text-ek-terracotta">
                  We could not place this one. {entry.reason}
                </p>
                {entry.summary.lines.length > 0 && (
                  <>
                    <p className="mt-3 text-15 text-ek-green-700">
                      What was in it:
                    </p>
                    <ul className="mt-1 text-15 text-ek-green-900">
                      {entry.summary.lines.map((line, index) => (
                        <li key={`${line.name}-${index}`}>
                          {line.qty} × {line.name} {line.pack}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-17">
                  <Link
                    href="/products"
                    className="link-draw text-ek-green-900"
                  >
                    Back to the shop
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      void forgetEntry(entry.id).then(refresh);
                    }}
                    className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4 hover:text-ek-gold-800"
                  >
                    Dismiss
                  </button>
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
