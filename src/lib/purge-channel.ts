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

export function isPurgeMessage(value: unknown): value is PurgeMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<PurgeMessage>;
  return (
    (message.kind === "catalog" || message.kind === "reviews") &&
    typeof message.origin === "string"
  );
}
