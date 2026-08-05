/**
 * The honeypot field name, and how to read it.
 *
 * Its own module, with no `server-only`, because both sides need it: the
 * form renders the field, the route checks it. Putting the constant in
 * src/lib/turnstile.ts would drag that file's `server-only` import into the
 * client bundle and fail the build.
 */

/** Plausible enough that a bot fills it; unrelated enough that autofill does not. */
export const HONEYPOT_FIELD = "company_website";

/**
 * Reads the field straight off the submitted form, so the DOM stays the
 * single source of truth. Keeping a React state mirror would only give the
 * two a chance to disagree, and this value exists precisely to be untouched
 * by anything the page does.
 */
export function readHoneypot(form: HTMLFormElement): string {
  const field = form.elements.namedItem(HONEYPOT_FIELD);
  return field instanceof HTMLInputElement ? field.value : "";
}
