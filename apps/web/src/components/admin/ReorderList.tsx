"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { ActionResult } from "@/app/admin/actions";

export interface ReorderItem {
  id: number;
  /** Plain text, for the screen-reader label on the move buttons. */
  label: string;
  /** Server-rendered row content, passed in as a node. */
  node: ReactNode;
}

/**
 * Reordering, by dragging or by keyboard.
 *
 * The buttons are not a consolation prize for the drag. Native HTML5
 * drag-and-drop is mouse-only — there is no keyboard equivalent, and on
 * touch it does not fire at all — so a drag-only list is unusable with a
 * keyboard, unusable on a phone, and invisible to a screen reader. The
 * buttons are the real control; the drag is the shortcut for whoever
 * happens to have a mouse.
 *
 * Nothing is saved until Save is pressed. A list that persisted on every
 * nudge would be five writes and five cache purges to move one pack three
 * places, and no way to change your mind halfway.
 *
 * The rows themselves are rendered on the server and arrive as nodes, so a
 * thumbnail or a price stays out of the client bundle — and so that a row
 * may contain its own form. Which is why the list sits *outside* the form
 * rather than wrapping it: a row with an edit form inside a reorder form is
 * a nested form, which is invalid HTML and which browsers resolve by
 * silently dropping the inner one.
 */
export function ReorderList({
  items,
  action,
  hidden = {},
  itemNoun,
}: {
  items: ReorderItem[];
  action: (
    previous: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  hidden?: Record<string, string | number>;
  itemNoun: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(action, null);

  const incoming = items.map((item) => item.id).join(",");
  const [snapshot, setSnapshot] = useState(incoming);
  const [order, setOrder] = useState<number[]>(() =>
    items.map((item) => item.id),
  );
  const [dragging, setDragging] = useState<number | null>(null);

  // The server list changed under us — a save landed, or a row was added.
  // Adjusting state during render is the documented way to react to a prop
  // change without an effect and an extra paint.
  if (snapshot !== incoming) {
    setSnapshot(incoming);
    setOrder(items.map((item) => item.id));
    setDragging(null);
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const dirty = order.join(",") !== incoming;

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div>
      <ul className="mt-4 flex flex-col">
        {order.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;

          return (
            <li
              key={id}
              draggable
              onDragStart={() => setDragging(index)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragging !== null && dragging !== index) {
                  move(dragging, index);
                  setDragging(index);
                }
              }}
              className={`flex items-start gap-3 border-b border-ek-green-200 py-3 last:border-b-0 ${
                dragging === index ? "opacity-50" : ""
              }`}
            >
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.label} up`}
                  className="min-h-11 w-11 cursor-pointer border border-ek-green-200 text-15 text-ek-green-900 transition-colors hover:border-ek-green-700 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === order.length - 1}
                  aria-label={`Move ${item.label} down`}
                  className="-mt-px min-h-11 w-11 cursor-pointer border border-ek-green-200 text-15 text-ek-green-900 transition-colors hover:border-ek-green-700 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  ↓
                </button>
              </div>
              <div className="min-w-0 flex-1">{item.node}</div>
            </li>
          );
        })}
      </ul>

      <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={String(value)} />
        ))}
        <input type="hidden" name="ids" value={order.join(",")} />

        <button
          type="submit"
          disabled={!dirty || pending}
          className="min-h-11 cursor-pointer bg-ek-green-900 px-4 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending ? "Saving…" : `Save ${itemNoun} order`}
        </button>
        {dirty && !pending && (
          <button
            type="button"
            onClick={() => setOrder(items.map((item) => item.id))}
            className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4 hover:text-ek-gold-800"
          >
            Undo
          </button>
        )}
        <span
          role="status"
          className={`text-15 ${
            state?.ok === false ? "text-ek-terracotta" : "text-ek-green-700"
          }`}
        >
          {state?.message ?? (dirty ? "Not saved yet." : "")}
        </span>
      </form>
    </div>
  );
}
