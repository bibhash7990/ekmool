import "server-only";
import { unstable_cache } from "next/cache";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

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

/* ------------------------------------------------------------------ */
/* The admin editor                                                    */

/** One override row, as stored. */
export interface ContentOverride {
  key: string;
  value: string;
  updatedBy: string | null;
  updatedAt: Date;
}

interface OverrideRow extends RowDataPacket {
  content_key: string;
  value: string;
  updated_by: string | null;
  updated_at: Date;
}

/**
 * Every override row, uncached and unmerged.
 *
 * Deliberately NOT getContent(). The editor has to show three different
 * things — what the default says, whether a row exists, and who changed it
 * — and a merged map has thrown all three away by the time it is returned.
 * It also must not read a cache the admin is about to purge, or the first
 * load after a save would show the previous value and read as a lost edit.
 *
 * The read is not wrapped in try/catch: /admin is not a rule 8 route, and
 * an editor that silently renders "no overrides" during an outage would
 * invite the owner to retype copy that is in fact already saved.
 */
export async function listContentOverrides(): Promise<
  Map<string, ContentOverride>
> {
  const pool = getPool();
  const [rows] = await pool.query<OverrideRow[]>(
    `SELECT content_key, value, updated_by, updated_at
       FROM site_content
      ORDER BY content_key`,
  );

  return new Map(
    rows.map((row) => [
      row.content_key,
      {
        key: row.content_key,
        value: row.value,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at,
      },
    ]),
  );
}

/**
 * Writes one override, or removes it.
 *
 * Passing a value equal to the default DELETEs the row rather than storing
 * a copy of it. Two reasons, and the second is the one that matters: a
 * stored copy of the default silently freezes that string, so a later
 * change in defaults.ts would appear to have no effect on the live site and
 * the developer would have no way to see why. Reverting in the editor
 * therefore genuinely reverts, rather than pinning.
 *
 * Returns the previous value — null when there was no row — so the caller
 * can write an audit entry and skip a no-op save.
 */
export async function setContentValue(params: {
  key: ContentKey;
  value: string;
  actor: string;
}): Promise<{ previous: string | null; removed: boolean }> {
  const pool = getPool();

  const [existing] = await pool.execute<OverrideRow[]>(
    `SELECT content_key, value, updated_by, updated_at
       FROM site_content
      WHERE content_key = ?`,
    [params.key],
  );
  const previous = existing[0]?.value ?? null;

  if (params.value === CONTENT_DEFAULTS[params.key]) {
    await pool.execute<ResultSetHeader>(
      "DELETE FROM site_content WHERE content_key = ?",
      [params.key],
    );
    return { previous, removed: true };
  }

  await pool.execute<ResultSetHeader>(
    `INSERT INTO site_content (content_key, value, updated_by)
          VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
          value = VALUES(value),
          updated_by = VALUES(updated_by)`,
    [params.key, params.value, params.actor.slice(0, 120)],
  );

  return { previous, removed: false };
}

/**
 * Rows whose key the code no longer knows about.
 *
 * Reported rather than deleted. A key usually disappears because it was
 * renamed, and the text in the orphaned row is often the text that should
 * be pasted into the new key — deleting it automatically would destroy
 * exactly the thing the owner needs during a rename.
 */
export function orphanedKeys(
  overrides: Map<string, ContentOverride>,
): ContentOverride[] {
  return [...overrides.values()].filter(
    (override) => !(override.key in CONTENT_DEFAULTS),
  );
}

/** Removes one orphan, deliberately, from the admin. */
export async function deleteContentKey(key: string): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    "DELETE FROM site_content WHERE content_key = ?",
    [key],
  );
  return result.affectedRows > 0;
}
