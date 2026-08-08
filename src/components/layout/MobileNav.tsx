"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MenuIcon, CloseIcon } from "@/components/icons";
import { ACCOUNT_LINK, NAV_LINKS } from "@/lib/constants";

/**
 * `children` is the search form, handed in from the (server) Header rather
 * than imported here — importing it would drag its markup into the client
 * bundle for a form that has no client behaviour.
 */
export function MobileNav({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus into the panel on open, back to the trigger on close. Without
  // this, focus stays on a button that is now behind an overlay: the next
  // Tab walks the hidden page, and a keyboard user cannot reach the menu
  // they just opened.
  //
  // `hasOpened` keeps the close branch from firing on mount, where it would
  // pull focus to the menu button on every page load.
  const hasOpened = useRef(false);
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      closeButtonRef.current?.focus();
    } else if (hasOpened.current) {
      openButtonRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={openButtonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center text-ek-green-900 md:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <MenuIcon className="size-6" />
      </button>

      {open && (
        // A column that owns the whole viewport, with only the nav
        // scrolling.
        //
        // `fixed inset-0` alone was not enough: the panel painted its
        // background over the viewport, but its content had no height
        // constraint, so a list longer than the screen overflowed and the
        // page behind showed through underneath it — the links appeared
        // interleaved with the hero text.
        //
        // h-dvh, not h-screen: on mobile Safari and Chrome 100vh is the
        // height with the URL bar hidden, so the last link sits under the
        // browser chrome until you scroll.
        //
        // role/aria-modal announce it as a layer over the page rather than
        // more of the same document. Escape and the body scroll lock were
        // already handled above; this was the missing part.
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-ek-paper md:hidden"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-ek-green-200 px-5 py-4">
            <span className="eyebrow text-ek-green-700">Menu</span>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-ek-green-900"
              aria-label="Close menu"
            >
              <CloseIcon className="size-6" />
            </button>
          </div>
          {children && <div className="shrink-0 px-5 pt-6">{children}</div>}

          {/* The only scrolling region, so the header and close button stay
              reachable however many links there are. */}
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-6">
            <ul className="flex flex-col">
              {[...NAV_LINKS, ACCOUNT_LINK].map((link) => (
                <li key={link.href} className="border-b border-ek-green-200">
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block py-4 font-display text-26 text-ek-green-900"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
