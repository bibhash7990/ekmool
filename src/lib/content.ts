import "server-only";

import { CONTENT_DEFAULTS, type ContentKey } from "@/content/defaults";
import type { ContentMap } from "@/db/queries/content";

export { getContent, CONTENT_TAG } from "@/db/queries/content";
export type { ContentMap } from "@/db/queries/content";
export type { ContentKey } from "@/content/defaults";

/**
 * One string from a loaded content map.
 *
 * Takes the map rather than fetching, so a page reads content once and
 * every `t()` below it is a plain object lookup — a component that awaited
 * its own copy would serialise a request per string.
 *
 * The return type is `string`, not `string | undefined`: getContent starts
 * from CONTENT_DEFAULTS, so every key in ContentKey is present whatever
 * the database did. The `?? CONTENT_DEFAULTS[key]` is belt and braces for
 * a map built some other way in a test.
 */
export function t(map: ContentMap, key: ContentKey): string {
  return map[key] ?? CONTENT_DEFAULTS[key];
}
