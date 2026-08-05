"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MenuIcon, CloseIcon } from "@/components/icons";
import { ACCOUNT_LINK, NAV_LINKS } from "@/lib/constants";

/**
 * `children` is the search form, handed in from the (server) Header rather
 * than imported here — importing it would drag its markup into the client
 * bundle for a form that has no client behaviour.
 */
export function MobileNav({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

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
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center text-ek-green-900 md:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <MenuIcon className="size-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-ek-paper md:hidden">
          <div className="flex items-center justify-between border-b border-ek-green-200 px-5 py-4">
            <span className="eyebrow text-ek-green-700">Menu</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-ek-green-900"
              aria-label="Close menu"
            >
              <CloseIcon className="size-6" />
            </button>
          </div>
          {children && <div className="px-5 pt-6">{children}</div>}

          <nav aria-label="Mobile" className="px-5 py-6">
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
