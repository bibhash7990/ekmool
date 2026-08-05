/**
 * A field only a bot fills in.
 *
 * Getting this wrong makes it an accessibility bug rather than a defence, so
 * every one of these matters:
 *
 *  - `aria-hidden` and `tabIndex={-1}` keep it out of the accessibility tree
 *    and out of the tab order, so a screen-reader user is never asked to
 *    fill in a field that will reject their order if they do.
 *  - Positioned off-screen rather than `display: none`. Some bots skip
 *    fields that are explicitly hidden, and `hidden`/`display:none` is the
 *    first thing they check.
 *  - `autoComplete="off"` so a password manager does not helpfully fill it
 *    in and lock a real customer out of the checkout.
 *  - The name is plausible enough that a naive bot wants to fill it, and
 *    unrelated enough to the real form that autofill heuristics do not.
 *
 * No `useId` here: the server has to know the name, and it is a constant
 * shared with src/lib/turnstile.ts.
 */
import { HONEYPOT_FIELD } from "@/lib/honeypot";

export function HoneypotField() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-[-9999px] h-px w-px overflow-hidden"
    >
      <label htmlFor={HONEYPOT_FIELD}>
        Leave this empty
        <input
          id={HONEYPOT_FIELD}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </label>
    </div>
  );
}
