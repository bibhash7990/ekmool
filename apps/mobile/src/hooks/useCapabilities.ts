import { useCallback, useEffect, useState } from "react";

import {
  loadCapabilities,
  peekCapabilities,
  refreshCapabilities,
  SAFE_DEFAULT_CAPABILITIES,
  type Capabilities,
} from "@/api/bootstrap";

/**
 * The bootstrap document, as a screen sees it.
 *
 * There is no `loading` flag and that is the point: `capabilities` is always
 * a usable value, and before the answer arrives it is the safe default —
 * `razorpay: false`, Cash on Delivery. A screen that waited on a flag would
 * either show a spinner over the shop while a 150-byte request completed, or
 * draw a payment section that changes shape under the customer's finger.
 *
 * `reachable` distinguishes "the shop has no online payment" from "we could
 * not ask", for copy that needs to be honest about which.
 */
export interface CapabilitiesResult {
  capabilities: Capabilities;
  /** Re-asks the server. Discards a previous answer, including a good one. */
  refresh(): void;
}

export function useCapabilities(): CapabilitiesResult {
  const [capabilities, setCapabilities] = useState<Capabilities>(
    // Synchronous, so a screen mounting after the first fetch has resolved
    // does not flash the COD-only layout on its way to the real one.
    () => peekCapabilities() ?? SAFE_DEFAULT_CAPABILITIES,
  );

  useEffect(() => {
    let active = true;
    void loadCapabilities().then((next) => {
      if (active) setCapabilities(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(() => {
    void refreshCapabilities().then(setCapabilities);
  }, []);

  return { capabilities, refresh };
}
