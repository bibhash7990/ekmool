"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * POSTs to /api/account/logout, then refreshes in place. The cookie is
 * cleared on that response, so the re-fetched server render of whatever
 * page we are on simply comes back signed out.
 */
export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/account/logout", { method: "POST" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className={`link-draw cursor-pointer text-15 text-ek-green-700 disabled:opacity-55 ${className}`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
