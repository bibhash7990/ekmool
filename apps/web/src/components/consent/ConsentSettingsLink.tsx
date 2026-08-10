"use client";

import { useSyncExternalStore } from "react";
import {
  clearConsent,
  getConsentServerSnapshot,
  getConsentSnapshot,
  subscribeConsent,
} from "@/lib/consent";

/**
 * The permanent way back to the decision, sitting in the footer.
 *
 * Consent that cannot be withdrawn as easily as it was given is not consent
 * — GDPR Art. 7(3) says so outright, and the DPDP Act's withdrawal right is
 * the same idea. So this is a plain control in the footer of every page, not
 * a setting buried inside an account area a guest does not have.
 *
 * It shows the current answer rather than a generic label, because "Cookie
 * settings" tells you nothing about what is presently happening to you.
 */
export function ConsentSettingsLink({
  className = "",
}: {
  className?: string;
}) {
  const decision = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );

  // "unread" is the server and the hydrating client. The neutral label keeps
  // the two renders identical; the real answer arrives a frame later.
  const label =
    decision === "unread" || decision === "undecided"
      ? "Cookie choices"
      : decision.analytics
        ? "Cookie choices · analytics on"
        : "Cookie choices · analytics off";

  return (
    <button type="button" onClick={clearConsent} className={className}>
      {label}
    </button>
  );
}
