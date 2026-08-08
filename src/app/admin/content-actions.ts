"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { revalidateContent } from "@/lib/revalidate";
import { recordAdminAction } from "@/db/queries/audit";
import {
  setContentValue,
  deleteContentKey,
} from "@/db/queries/content";
import {
  CONTENT_DEFAULTS,
  maxLengthFor,
  type ContentKey,
} from "@/content/defaults";
import type { ActionResult } from "./actions";

/**
 * Editorial copy writes.
 *
 * Its own file for the reason catalog-actions.ts is its own file. The
 * habits from there apply unchanged: validate with Zod, audit after the
 * commit, and purge by tag.
 *
 * One habit is specific to this surface. The value is never trusted to
 * name its own key — `isContentKey` checks it against the compile-time
 * union before anything is written, so a hand-crafted POST cannot insert a
 * row for a key the code has never heard of. Such a row would be invisible
 * (loadContent ignores unknown keys) but it would sit in the table looking
 * like copy, and the orphan report would then be reporting an attack rather
 * than a rename.
 */

function isContentKey(value: unknown): value is ContentKey {
  return typeof value === "string" && value in CONTENT_DEFAULTS;
}

/**
 * Newlines are kept — a paragraph may want them — but every other control
 * character is stripped. A zero-width space, or a bidi override pasted from
 * a word processor, renders as nothing: a value containing one cannot be
 * told from a correct one by looking at the field, so it is removed at the
 * write rather than left to be hunted for later.
 */
function clean(value: string): string {
  return (
    value
      .replace(/\r\n/g, "\n")
      // C0 and C1 controls, except newline and tab.
      // no-control-regex does not fire on \u escapes, so there is no
      // disable directive here — the escapes are also what keeps the
      // source readable, since the literals are invisible in an editor.
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, "")
      // Zero-width, bidi and invisible spacing characters.
      .replace(/[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\uFEFF]/g, "")
      .trim()
  );
}

const saveSchema = z.object({
  key: z.string().refine(isContentKey, "That is not an editable field."),
  value: z.string(),
});

export async function saveContentAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = saveSchema.safeParse({
    key: formData.get("key"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the field and try again.",
    };
  }

  // The refine above narrows at runtime; this restates it for the compiler.
  const key = parsed.data.key as ContentKey;
  const value = clean(parsed.data.value);

  // Emptiness is refused rather than stored. Every one of these strings is
  // rendered unconditionally, so a blank value is not "hidden" — it is a
  // heading that is not there and a button with no words on it.
  if (!value) {
    return {
      ok: false,
      message:
        "This cannot be empty. To put the original wording back, use Revert.",
    };
  }

  const limit = maxLengthFor(key);
  if (value.length > limit) {
    return {
      ok: false,
      message: `That is ${value.length} characters and the limit is ${limit}.`,
    };
  }

  try {
    const { previous, removed } = await setContentValue({
      key,
      value,
      actor: userId,
    });

    const effectiveBefore = previous ?? CONTENT_DEFAULTS[key];
    if (effectiveBefore === value) {
      return { ok: true, message: "Nothing changed." };
    }

    await recordAdminAction({
      actor: userId,
      action: removed ? "content.revert" : "content.update",
      entityType: "content",
      entityId: key,
      summary: removed
        ? `Reverted ${key} to the original wording`
        : `Edited ${key}`,
      // The full before and after, not a summary of them. This is the only
      // record of what the copy used to say — the table keeps one value per
      // key and no history of its own.
      detail: { value: { from: effectiveBefore, to: value } },
    });

    revalidateContent();
    revalidatePath("/admin/content");

    return {
      ok: true,
      message: removed
        ? "Reverted. The site shows the original wording again."
        : "Saved. Live on the site within the hour, or on the next request.",
    };
  } catch (error) {
    console.error("[admin] content save failed:", error);
    return { ok: false, message: "Could not save that. Try again." };
  }
}

/**
 * Removing a row whose key the code no longer has.
 *
 * Separate from the save path and deliberately manual: an orphan is
 * usually the text from a renamed key, and that text is often what the
 * owner wants to paste into its replacement. Deleting it automatically —
 * on deploy, say — would destroy it at exactly the moment it is needed.
 */
export async function deleteOrphanAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { ok: false, message: "Unknown field." };

  // Refuse to delete a live key through this path. The two are separate
  // buttons in the UI, but the action must not depend on the UI being the
  // only caller — a live key deleted here would revert copy with no
  // confirmation and no "Reverted" message to explain it.
  if (isContentKey(key)) {
    return {
      ok: false,
      message: "That field is still in use. Use Revert instead.",
    };
  }

  try {
    const removed = await deleteContentKey(key);
    if (!removed) return { ok: false, message: "Already gone." };

    await recordAdminAction({
      actor: userId,
      action: "content.orphan.delete",
      entityType: "content",
      entityId: key,
      summary: `Removed the leftover field ${key}`,
    });

    // No revalidateContent: an orphan is by definition not rendered, so
    // nothing a visitor can see has changed.
    revalidatePath("/admin/content");
    return { ok: true, message: "Removed." };
  } catch (error) {
    console.error("[admin] orphan delete failed:", error);
    return { ok: false, message: "Could not remove that." };
  }
}
