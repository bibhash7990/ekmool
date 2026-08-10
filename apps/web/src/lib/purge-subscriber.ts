import "server-only";
import { getRedisSubscriber, hasRedis } from "@/lib/redis";
import {
  PURGE_CHANNEL,
  crossInstancePurgeNeeded,
  instanceId,
  isPurgeMessage,
  type PurgeKind,
} from "@/lib/purge-channel";
import { revalidateSecret } from "@/lib/env";

/**
 * Listens for a cache purge announced by another instance and applies it
 * here.
 *
 * It applies it by calling this instance's own `/api/revalidate` over
 * loopback rather than calling `revalidateTag` directly, which looks
 * roundabout and is not. `revalidateTag` needs Next's request store, and a
 * Redis message handler has no request behind it — the call would throw. A
 * route handler is a request by definition, and it is the same endpoint
 * that has been exercised by `chaos` since M6.
 *
 * The `fanout=1` marker is what stops two containers forwarding the same
 * purge to each other for the rest of the afternoon.
 */

declare global {
  var __ekmoolPurgeSubscribed: boolean | undefined;
}

function selfUrl(kind: PurgeKind): string {
  // Loopback, not NEXT_PUBLIC_APP_URL. The point is to reach *this*
  // process; the public hostname would go back through the load balancer
  // and land on whichever instance it liked, most likely the one that
  // already purged.
  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}/api/revalidate?fanout=1&kind=${kind}`;
}

export function startPurgeSubscriber(): void {
  if (!hasRedis) return;
  // On Vercel revalidateTag is already global and a frozen function cannot
  // receive on a subscription anyway. See crossInstancePurgeNeeded.
  if (!crossInstancePurgeNeeded) return;
  if (globalThis.__ekmoolPurgeSubscribed) return;

  if (!revalidateSecret) {
    console.warn(
      "[purge] REDIS_URL is set but REVALIDATE_SECRET is not — cache purges will stay local to the instance that made them",
    );
    return;
  }

  const subscriber = getRedisSubscriber();
  if (!subscriber) return;

  globalThis.__ekmoolPurgeSubscribed = true;

  /**
   * Subscribe on every `ready`, not once at startup.
   *
   * A SUBSCRIBE does not survive a reconnect — Redis forgets the
   * subscription along with the connection, and ioredis restores it only
   * for channels it knows about. Re-issuing it on each `ready` covers the
   * first connection and every reconnection after a restart with the same
   * line, and SUBSCRIBE to a channel already subscribed is a no-op.
   *
   * Without this the failure is the quiet kind: purges work until Redis is
   * restarted once, then silently stop, and the symptom appears weeks
   * later as "the site did not save my change".
   */
  const subscribe = () => {
    subscriber.subscribe(PURGE_CHANNEL).catch((error: unknown) => {
      console.error(
        "[purge] could not subscribe:",
        error instanceof Error ? error.message : error,
      );
    });
  };

  subscriber.on("ready", subscribe);
  if (subscriber.status === "ready") subscribe();

  subscriber.on("message", (channel: string, payload: string) => {
    if (channel !== PURGE_CHANNEL) return;

    let message: unknown;
    try {
      message = JSON.parse(payload);
    } catch {
      return;
    }
    if (!isPurgeMessage(message)) return;
    // Our own announcement, come back to us.
    if (message.origin === instanceId()) return;

    void fetch(selfUrl(message.kind), {
      method: "POST",
      headers: { "x-revalidate-secret": revalidateSecret },
    }).catch((error: unknown) => {
      console.error(
        "[purge] could not apply a purge from another instance:",
        error instanceof Error ? error.message : error,
      );
    });
  });

  console.log(`[purge] listening on ${PURGE_CHANNEL} as ${instanceId()}`);
}
