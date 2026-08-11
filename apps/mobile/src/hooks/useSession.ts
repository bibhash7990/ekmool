import { useCallback, useEffect, useState } from "react";

import { loadSession, peekSession, subscribeToSession } from "@/lib/session";

/**
 * The session, as a screen sees it.
 *
 * Three states rather than a nullable session, because "we have not read the
 * keystore yet" and "there is no session" want different screens and
 * collapsing them shows the sign-in door for one frame to a customer who is
 * already signed in. `expo-secure-store` is asynchronous — it is the Keychain
 * on iOS — so that frame is real, not theoretical.
 */
/**
 * The signed-in arm carries the **email and nothing else**, deliberately.
 *
 * The stored session also holds the bearer token, and no screen has any
 * business reading it: `src/api/client.ts` attaches it to every request, and
 * a token that reached a component is a token one careless log line away from
 * a crash report. The email is what a screen legitimately needs — it is what
 * the account is, and it is printed on the order history.
 */
export type SessionState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string };

function fromCache(): SessionState {
  const cached = peekSession();
  // `peekSession` returns null both before the first read and when signed
  // out, so a null here cannot be read as "signed out" — it is "not known
  // yet", and the effect below settles it. Treating it as signed out is the
  // bug this comment exists to stop being reintroduced.
  return cached
    ? { status: "signed-in", email: cached.email }
    : { status: "loading" };
}

/**
 * Reads the session once and then follows it.
 *
 * The subscription is not an optimisation. `src/api/client.ts` clears the
 * keystore on any 401 — an expired token, or an erased customer — and every
 * screen holding account data has to stop showing it when that happens. The
 * rejected alternative was for each caller to check the failure code and
 * navigate itself, which works until one caller forgets; the symptom of
 * forgetting is a screen quietly showing somebody's orders after the server
 * has stopped agreeing they are signed in.
 */
export interface SessionResult {
  /**
   * Returned under a key rather than spread into the result, so that
   * `if (session.status === "signed-in")` narrows to a member of the union.
   * Spreading a discriminated union into a wider object throws the
   * discriminant away and every screen would need a non-null assertion to
   * read `session.email`.
   */
  session: SessionState;
  /** Re-reads the keystore. For a screen returned to after signing in. */
  reload: () => void;
}

export function useSession(): SessionResult {
  const [state, setState] = useState<SessionState>(fromCache);

  useEffect(() => {
    let active = true;

    void loadSession().then((session) => {
      if (!active) return;
      setState(
        session
          ? { status: "signed-in", email: session.email }
          : { status: "signed-out" },
      );
    });

    // Subscribed before the load resolves, so a sign-out racing the first
    // read cannot be overwritten by it — the listener fires on the clear and
    // the resolved load is stale by then, which is why `active` guards it.
    const unsubscribe = subscribeToSession((session) => {
      if (!active) return;
      setState(
        session
          ? { status: "signed-in", email: session.email }
          : { status: "signed-out" },
      );
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const reload = useCallback(() => {
    void loadSession().then((session) => {
      setState(
        session
          ? { status: "signed-in", email: session.email }
          : { status: "signed-out" },
      );
    });
  }, []);

  return { session: state, reload };
}
