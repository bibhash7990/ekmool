"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";

/**
 * A labelled sign-out for the admin header.
 *
 * Clerk's <UserButton /> already offers this, but only behind a bare
 * circular avatar with no text — which is not discoverable, and rule 11
 * asks for visible labels rather than icon-only controls. The avatar stays
 * for account management; this sits beside it and says what it does.
 *
 * Redirects to "/" rather than refreshing in place, because every admin
 * route 404s the moment the session ends: staying put would replace the
 * page you just left with an error, which reads as a failure rather than
 * a successful sign-out. That is the one behavioural difference from the
 * customer SignOutButton, whose pages remain valid signed out.
 */
export function AdminSignOut() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        // No try/finally resetting `busy`: this navigates away, and
        // re-enabling the button on an unmounting component would only
        // invite a second click mid-redirect.
        void signOut({ redirectUrl: "/" });
      }}
      className="link-draw cursor-pointer text-15 text-ek-green-700 disabled:opacity-55"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
