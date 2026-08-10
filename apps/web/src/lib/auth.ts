import "server-only";
import { notFound } from "next/navigation";
import { hasClerk } from "@/lib/env";

/**
 * Admin gate. Two independent conditions must hold:
 *   1. Clerk is configured at all
 *   2. the signed-in user carries publicMetadata.role === 'admin'
 *
 * Failing either returns 404 rather than 403, so an unauthenticated
 * visitor cannot even confirm that an admin surface exists here.
 *
 * The role arrives via the session token, which requires a one-time
 * Dashboard customisation — see docs/keys-needed.md.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  if (!hasClerk) notFound();

  const { auth } = await import("@clerk/nextjs/server");
  const { userId, sessionClaims } = await auth();

  if (!userId) notFound();

  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") notFound();

  return { userId };
}

/** Same check for route handlers, which answer with JSON instead of HTML. */
export async function isAdminRequest(): Promise<boolean> {
  if (!hasClerk) return false;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId, sessionClaims } = await auth();
    if (!userId) return false;
    const role = (sessionClaims?.metadata as { role?: string } | undefined)
      ?.role;
    return role === "admin";
  } catch {
    return false;
  }
}
