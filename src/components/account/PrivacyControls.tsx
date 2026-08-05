"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Download and erasure, side by side.
 *
 * The erasure control is deliberately awkward: it is closed by default,
 * requires the word ERASE typed out, and states in advance exactly what
 * survives. Every one of those is friction, and friction is right here —
 * this is the one action on the site that cannot be undone.
 *
 * It is also the only place on the site where the destructive button is
 * styled as the loud one. Everywhere else that would be a dark pattern;
 * here, a hesitant-looking button on an irreversible action would be worse,
 * because it hides the consequence rather than the control.
 */
export function PrivacyControls({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function erase() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/account/erase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: confirmation.trim().toUpperCase() }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Nothing has been changed.");
        return;
      }

      setDone(data.message as string);
      // The session was cleared server-side; refresh so nothing on screen is
      // still rendering from an account that no longer exists.
      router.refresh();
    } catch {
      setError(
        "We could not reach the site just now. Nothing has been changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        className="mt-10 max-w-[62ch] border border-ek-green-200 bg-ek-cream p-6"
      >
        <h3 className="font-display text-20 text-ek-green-900">Done</h3>
        <p className="mt-3 text-17 text-ek-green-700">{done}</p>
        <Button
          variant="secondary"
          className="mt-6"
          onClick={() => router.push("/")}
        >
          Back to the shop
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-12 max-w-[62ch]">
      <div className="border-t border-ek-green-200 pt-8">
        <h3 className="font-display text-20 text-ek-green-900">
          Download everything
        </h3>
        <p className="mt-3 text-17 text-ek-green-700">
          A JSON file with every row we hold against {email}, exactly as it is
          stored. Nothing is summarised or left out.
        </p>
        {/* A real anchor, not a scripted navigation. The route replies with
            a Content-Disposition attachment, so the browser's own download
            handling takes over — which also means it still works with the
            keyboard, in a new tab, and from the context menu. */}
        <a
          href="/api/account/export"
          download
          className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-sm border border-ek-green-900 px-5 py-2.5 text-17 font-medium text-ek-green-900 transition-colors duration-200 hover:bg-ek-green-900 hover:text-ek-cream"
        >
          Download my data
        </a>
      </div>

      <div className="mt-10 border-t border-ek-green-200 pt-8">
        <h3 className="font-display text-20 text-ek-green-900">
          Erase my data
        </h3>
        <p className="mt-3 text-17 text-ek-green-700">
          This cannot be undone, so read what it does first.
        </p>

        <dl className="mt-5 text-17">
          <dt className="font-medium text-ek-green-900">Deleted outright</dt>
          <dd className="mt-1 text-ek-green-700">
            Your account, your name, your phone number, your saved addresses,
            your saved items, any back-in-stock requests, and your email
            address wherever it appears.
          </dd>
          <dt className="mt-4 font-medium text-ek-green-900">
            Kept, but no longer yours
          </dt>
          <dd className="mt-1 text-ek-green-700">
            The orders themselves. Indian tax law requires the transaction
            records behind an invoice to be kept for several years, so they
            stay — with every trace of you overwritten. What remains says
            what was sold, for how much, and to which state. It identifies
            nobody.
          </dd>
          <dt className="mt-4 font-medium text-ek-green-900">
            You will be signed out
          </dt>
          <dd className="mt-1 text-ek-green-700">
            And you will not be able to look those orders up again — the
            email that would have found them is gone.
          </dd>
        </dl>

        {!open ? (
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setOpen(true)}
          >
            I want to erase my data
          </Button>
        ) : (
          <div className="mt-6 border border-ek-terracotta bg-ek-terracotta/5 p-5">
            {error && (
              <p role="alert" className="mb-4 text-15 text-ek-terracotta">
                {error}
              </p>
            )}
            <label
              htmlFor="erase-confirm"
              className="block text-15 text-ek-green-900"
            >
              Type <strong>ERASE</strong> to confirm
            </label>
            <input
              id="erase-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-2 min-h-11 w-full max-w-56 border border-ek-green-200 bg-ek-paper px-3 py-2.5 font-mono text-17 tracking-[0.12em] text-ek-green-900 uppercase"
            />
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                onClick={erase}
                disabled={busy || confirmation.trim().toUpperCase() !== "ERASE"}
              >
                {busy ? "Erasing…" : "Erase my data permanently"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setConfirmation("");
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
