import { getContent } from "@/db/queries/content";
import { documentResponse, toContentDocument } from "@/lib/catalog-document";

/**
 * GET /catalog/content-v1.json — editorial copy and the legal pages.
 *
 * WHY THE APP READS THE SAME SOURCE AS THE SITE
 *
 * The four legal pages became admin-editable in this milestone. If the app
 * bundled its own copy of the privacy policy, the two would diverge the first
 * time the owner edited one — and a privacy policy that differs by device is
 * a compliance problem before it is a content problem. One source, one edit,
 * both surfaces.
 *
 * `getContent()` is already `unstable_cache(loadContent, ["site-content"], {
 * tags: [CONTENT_TAG], revalidate: 3600 })`, so `revalidateContent()` — which
 * the admin's content editor already calls — purges this document too. No new
 * invalidation story, no new SQL, and rule 9 as usual: the tag, never a path.
 *
 * Its own tag and its own document for the same reason reviews are separate:
 * an edit to a paragraph on /about must not invalidate the catalogue on every
 * phone.
 *
 * A NOTE ON THE DEGRADATION CONTRACT
 *
 * `loadContent` starts from CONTENT_DEFAULTS and logs-and-carries-on if the
 * database read fails, so this document is well-formed and complete even when
 * it is built with MySQL stopped — the defaults *are* the site. That is
 * inherited, not re-implemented here; there is nothing this route does that
 * could make it less true.
 */

export const dynamic = "force-static";
export const revalidate = 3600;

/** No `request` parameter — see the note in ../v1.json/route.ts. */
export async function GET(): Promise<Response> {
  const values = await getContent();
  return documentResponse(toContentDocument(values));
}
