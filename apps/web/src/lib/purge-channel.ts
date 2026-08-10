/**
 * The vocabulary of a cross-instance cache purge.
 *
 * Its own module, with no imports, because both ends need it and the two
 * ends must not import each other: `revalidate.ts` pulls in `next/cache`
 * and is reachable from page bundles, while the subscriber pulls in
 * ioredis and must never be.
 */

export const PURGE_CHANNEL = "ekmool:purge";

export type PurgeKind = "catalog" | "reviews" | "content";

export interface PurgeMessage {
  kind: PurgeKind;
  /** Which instance published it, so that instance can ignore its own echo. */
  origin: string;
  at: number;
}

declare global {
  var __ekmoolInstanceId: string | undefined;
}

/** Stable for the life of the process. */
export function instanceId(): string {
  globalThis.__ekmoolInstanceId ??= `${process.pid}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  return globalThis.__ekmoolInstanceId;
}

/**
 * Every kind, as a runtime value. The guard below reads this rather than
 * listing the kinds a second time: when "content" was added to PurgeKind
 * the guard was not updated, so every instance but the editing one dropped
 * the purge on the floor and kept serving the old copy for an hour — the
 * exact ghost the channel exists to prevent. A union and a hand-written
 * list of the same union cannot be kept in step by the compiler; deriving
 * one from the other is what makes the next addition safe.
 */
const PURGE_KINDS = ["catalog", "reviews", "content"] as const;

// Fails to compile if PURGE_KINDS and PurgeKind ever drift apart.
type KindsAreExhaustive = PurgeKind extends (typeof PURGE_KINDS)[number]
  ? true
  : never;
const _kindsAreExhaustive: KindsAreExhaustive = true;
void _kindsAreExhaustive;

export function isPurgeMessage(value: unknown): value is PurgeMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<PurgeMessage>;
  return (
    PURGE_KINDS.includes(message.kind as PurgeKind) &&
    typeof message.origin === "string"
  );
}
