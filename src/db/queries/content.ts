import "server-only";
import { unstable_cache } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { getPool } from "@/db/pool";
import {
  CONTENT_DEFAULTS,
  type ContentKey,
} from "@/content/defaults";

/**
 * Editorial copy, read at BUILD time and cached under one tag.
 *
 * Same shape as the catalogue read next door, for the same reason: rule 8
 * requires `/`, `/products`, `/products/[slug]`, `/blog/*` and the policy
 * pages to serve with MySQL stopped. Reading copy on a visitor's request
 * would make every one of them dynamic and turn a database outage into a
 * whole-site outage instead of a checkout outage.
 *
 * An admin edit writes a row and purges CONTENT_TAG — never a path. Rule 9
 * exists because a path purge once 404'd all five product pages
 * permanently, with the database perfectly healthy.
 */

export const CONTENT_TAG = "site-content";
const REVALIDATE_SECONDS = 3600;

interface ContentRow extends RowDataPacket {
  content_key: string;
  value: string;
}

export type ContentMap = Record<ContentKey, string>;

async function loadContent(): Promise<ContentMap> {
  // Start from the defaults so every key is present whatever the database
  // returns, and `t()` can have a non-optional return type.
  const merged: Record<string, string> = { ...CONTENT_DEFAULTS };

  try {
    const pool = getPool();
    const [rows] = await pool.query<ContentRow[]>(
      "SELECT content_key, value FROM site_content",
    );

    for (const row of rows) {
      // Ignore keys the code no longer knows about. They are reported as
      // orphans in the admin rather than silently widening the map — a
      // stale row must never be able to shadow a key that was renamed.
      if (row.content_key in CONTENT_DEFAULTS) {
        merged[row.content_key] = row.value;
      }
    }
  } catch (error) {
    // The defaults ARE the site. Failing here would take down pages that
    // are specified to work with no database at all, so this logs and
    // carries on — the same degradation getCatalog already has.
    console.error("[content] read failed; serving defaults", error);
  }

  return merged as ContentMap;
}

export const getContent = unstable_cache(loadContent, ["site-content"], {
  tags: [CONTENT_TAG],
  revalidate: REVALIDATE_SECONDS,
});
