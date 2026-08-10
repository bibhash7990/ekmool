/**
 * Re-export shim. The implementation is in @ekmool/core/money.
 *
 * Kept because `@/lib/money` is imported by about thirty components and by
 * scripts/test-home.mjs through the `@/` resolve hook. Rewriting all of them
 * is thirty-odd chances to introduce a typo in a change whose entire claim is
 * that nothing changed, and `formatPaise` is not a name anyone needs to
 * re-learn. The modules with a handful of call sites — gst, coupons,
 * serviceability, search — were rewritten and deleted instead.
 */
export { formatPaise, paiseToRupees } from "@ekmool/core/money";
