import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { presignUpload, hasObjectStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const schema = z.object({
  slug: z.string().trim().min(1).max(120),
  contentType: z.string().trim().max(60),
});

/**
 * Issues one signed URL for one object.
 *
 * 404 rather than 401 or 403 when the caller is not an admin, matching
 * requireAdmin: an unauthenticated request should not be able to confirm
 * that an admin API exists here, let alone that it hands out upload
 * credentials.
 *
 * The key is generated server-side from a random 12 bytes. Nothing the
 * client sends becomes part of the path, so there is no traversal to
 * attempt and no existing object to overwrite by guessing its name. The
 * slug only decorates the prefix and is reduced to [a-z0-9-] on the way in.
 */
export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!hasObjectStorage) {
    return NextResponse.json(
      { error: "No object storage is configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ticket = presignUpload({
    slug: parsed.data.slug,
    contentType: parsed.data.contentType,
  });

  if (!ticket) {
    return NextResponse.json(
      { error: "That file type cannot be uploaded." },
      { status: 415 },
    );
  }

  return NextResponse.json(
    {
      uploadUrl: ticket.uploadUrl,
      publicUrl: ticket.publicUrl,
      expiresInSeconds: ticket.expiresInSeconds,
    },
    // A signed URL is a bearer credential with a five-minute life. It must
    // not sit in any cache, shared or private.
    { headers: { "Cache-Control": "no-store" } },
  );
}
