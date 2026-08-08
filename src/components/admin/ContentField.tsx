"use client";

import { useActionState, useId, useState } from "react";
import {
  saveContentAction,
  deleteOrphanAction,
} from "@/app/admin/content-actions";
import type { ActionResult } from "@/app/admin/actions";
import type { ContentKey } from "@/content/defaults";

/**
 * One editable string.
 *
 * A form per field rather than one form for the page. Saving a heading
 * should not resubmit forty other strings the owner did not touch: it makes
 * every save a whole-page write, it makes the audit log claim forty edits
 * where there was one, and it means a validation failure anywhere loses the
 * work everywhere. The cost is a save button per field, which is also what
 * makes it obvious what has been saved and what has not.
 */

export interface ContentFieldProps {
  contentKey: ContentKey;
  label: string;
  hint?: string;
  /** The wording in the code — what Revert goes back to. */
  fallback: string;
  /** What is stored, if anything. */
  current: string;
  overridden: boolean;
  maxLength: number;
  updatedAt: string | null;
  /** Prose: gets a tall box and the formatting note. */
  markdown?: boolean;
}

/** Over about a line and a half, a single-line input stops being usable. */
const MULTILINE_ABOVE = 90;

export function ContentField({
  contentKey,
  label,
  hint,
  fallback,
  current,
  overridden,
  maxLength,
  updatedAt,
  markdown = false,
}: ContentFieldProps) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveContentAction,
    null,
  );
  const [value, setValue] = useState(current);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;

  const multiline = markdown || maxLength > MULTILINE_ABOVE;
  const dirty = value !== current;
  const isDefault = value === fallback;

  const shared = {
    id: fieldId,
    name: "value",
    value,
    maxLength,
    "aria-describedby": hint ? hintId : undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setValue(event.target.value),
    className:
      "w-full border border-ek-green-200 bg-ek-paper px-2.5 py-2 text-15 text-ek-green-900",
  };

  return (
    <form action={action} className="border-t border-ek-green-200 py-5">
      <input type="hidden" name="key" value={contentKey} />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <label htmlFor={fieldId} className="text-15 text-ek-green-900">
          {label}
        </label>
        <span className="text-15 text-ek-green-700">
          {overridden ? (
            <>
              Edited
              {updatedAt ? ` · ${updatedAt}` : ""}
            </>
          ) : (
            "Original wording"
          )}
        </span>
      </div>

      {hint && (
        <p id={hintId} className="mt-1 max-w-[70ch] text-15 text-ek-green-700">
          {hint}
        </p>
      )}

      <div className="mt-2">
        {multiline ? (
          <textarea
            {...shared}
            // Prose needs room to see a whole section at once; editing a
            // policy through a three-line slot is how a paragraph gets
            // duplicated without anyone noticing.
            rows={markdown ? Math.min(20, 6 + Math.floor(value.length / 180)) : 3}
            className={`${shared.className} ${markdown ? "font-mono text-[13px] leading-relaxed" : ""}`}
          />
        ) : (
          <input {...shared} type="text" />
        )}
      </div>

      {markdown && (
        <p className="mt-1.5 text-15 text-ek-green-700">
          Blank line between paragraphs. <code>- item</code> for a bullet,{" "}
          <code>**bold**</code>, <code>[words](/page)</code> for a link.
          Anything else is shown as plain text.
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="min-h-11 cursor-pointer bg-ek-green-900 px-4 py-2 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:cursor-default disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>

        {/* Revert is a local reset, not a second action: it puts the
            original wording in the box and leaves the owner to save it.
            setContentValue deletes the row when the value equals the
            default, so saving it is what actually reverts — and this way
            the change is previewed before it is committed, like every
            other edit on the page. */}
        <button
          type="button"
          onClick={() => setValue(fallback)}
          disabled={isDefault}
          className="min-h-11 cursor-pointer px-1 py-2 text-15 text-ek-green-700 underline underline-offset-4 disabled:cursor-default disabled:no-underline disabled:opacity-50"
        >
          Revert to original
        </button>

        <span className="text-15 tabular-nums text-ek-green-700">
          {value.length}/{maxLength}
        </span>

        {state && (
          <span
            role="status"
            className={`text-15 ${
              state.ok ? "text-ek-green-700" : "text-ek-terracotta"
            }`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * A stored row whose key the code no longer has.
 *
 * Shown with its text, not just its name. A key normally disappears
 * because it was renamed, and this text is usually what should be pasted
 * into the new field — which is only possible if it is on the screen.
 */
export function OrphanRow({
  contentKey,
  value,
}: {
  contentKey: string;
  value: string;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    deleteOrphanAction,
    null,
  );

  return (
    <form action={action} className="border-t border-ek-green-200 py-4">
      <input type="hidden" name="key" value={contentKey} />
      <p className="font-mono text-15 text-ek-green-900">{contentKey}</p>
      <p className="mt-1 max-w-[70ch] text-15 whitespace-pre-wrap text-ek-green-700">
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 cursor-pointer px-1 py-2 text-15 text-ek-terracotta underline underline-offset-4 disabled:opacity-50"
        >
          {pending ? "Removing…" : "Remove"}
        </button>
        {state && (
          <span
            role="status"
            className={`text-15 ${
              state.ok ? "text-ek-green-700" : "text-ek-terracotta"
            }`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
