# Plan — admin-editable site content

Every visible string on the site becomes editable from `/admin/content`,
without breaking the two properties the site is built on: browsing never
touches the database, and the site works with the database stopped.

**Status:** phases 1 and 2 are shipped. Phase 3 — migrating the pages to
`t()` — is the next one, and is where the site starts reading any of this.
Until then the editor writes rows that nothing renders, which is the
phase boundary working as designed, not a bug.

---

## What this covers

Measured against the tree, not estimated:

| Surface | Size |
|---|---|
| Routes with visible copy | 43 page files |
| Components containing prose | 37 |
| `src/content/*.ts` | 477 lines (products, FAQ) |
| Policy/legal pages | 4 (privacy, terms, shipping, refund) |
| Nav labels, taglines | `src/lib/constants.ts` |

Product names and descriptions are **already** admin-editable through
`/admin/products` — they live in MySQL. This plan is about everything
else: headings, body copy, FAQ answers, policy text, nav labels, the
homepage sections, About, and the editorial blocks inside components.

---

## The constraint that shapes the whole design

Rule 8 says `/`, `/products`, `/products/[slug]`, `/blog/*` and the policy
pages are static and must serve 200s **with MySQL stopped** — `npm run
chaos` asserts it. Rule 9 says purge with `revalidateTag`, never
`revalidatePath`, because a path purge once 404'd all five product pages
permanently in production.

A naive CMS breaks both: read copy from the database at request time and
every page becomes dynamic, `chaos` fails, and a database outage takes the
whole site down instead of just checkout.

So content is **read at build time and cached by tag**, exactly as the
product catalogue already is. An admin edit writes to MySQL and calls
`revalidateTag(CONTENT_TAG)`. Pages regenerate; they never query on a
visitor's request.

The fallback is what preserves rule 8. Every content key keeps its current
hardcoded string in `src/content/defaults.ts` as a compile-time constant.
If the database is unreachable, or a key has never been edited, the
default renders. The site is then exactly what it is today.

---

## Data model

One table, because the content is a flat key/value space and a schema per
page would need a migration every time a page gains a paragraph.

```sql
CREATE TABLE site_content (
  content_key   VARCHAR(160) NOT NULL,   -- 'home.hero.heading'
  value         TEXT         NOT NULL,
  format        ENUM('text','markdown') NOT NULL DEFAULT 'text',
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
  updated_by    VARCHAR(190) NULL,       -- Clerk user, for the audit trail
  PRIMARY KEY (content_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

Keys are dotted and namespaced by page: `home.hero.heading`,
`about.story.body`, `faq.gi-tag.answer`, `policy.refund.body`,
`nav.account.label`.

**Deliberately not a `pages` table with columns.** A column per field means
a migration per copy change, which is the problem this is meant to solve.

**Deliberately no soft delete.** A key that disappears from the code is
dead weight, not history; the admin lists orphaned keys so they can be
removed deliberately.

---

## Reading

`src/lib/content.ts`:

```ts
export async function getContent(): Promise<Record<string, string>>
export function t(map: Record<string, string>, key: ContentKey): string
```

- `getContent` is `unstable_cache`d under `CONTENT_TAG`, like `getCatalog`.
- It returns defaults merged with database rows, so a missing key is
  impossible and `t()` never returns undefined.
- On a database error it logs and returns defaults — the same
  degradation the catalogue read already has.

`ContentKey` is a union type generated from `defaults.ts`, so a typo in a
key is a **compile error**, not a blank space on a live page.

---

## Writing

`/admin/content`, grouped by page, mirroring the site's own navigation:

- **Home** · **About** · **FAQ** · **Contact** · **Policies** ·
  **Navigation** · **Footer**
- Each field shows its key, the current value, and the default it
  overrides, with a **Reset to default** action.
- `markdown` fields render a preview; `text` fields are plain inputs. No
  rich-text editor — it invites markup that breaks the design system.
- Saving writes the row, calls `revalidateTag(CONTENT_TAG)`, and records
  the change in the existing `admin_audit` table.

Validation with Zod in the server action, as every other admin write does.
Length limits per key so a heading cannot be pasted as three paragraphs
and break the layout.

---

## Phases

Each is separately shippable and leaves the site working.

**1 · Foundation** — migration `009_site_content.sql`, `src/lib/content.ts`,
`src/content/defaults.ts` seeded from today's strings, `CONTENT_TAG` wired
into the existing purge path. No visible change; `chaos` and `test:db-down`
must still pass.

**2 · Admin surface** — `/admin/content` with the grouped editor, server
action, Zod validation, audit-log entry. Editing works but nothing on the
public site reads it yet. **Shipped.** Three decisions were taken during
the build that the design above did not settle:

- **A form per field, not one form per page.** Saving a heading must not
  resubmit forty untouched strings: that would make every save a
  whole-page write, make the audit log claim forty edits where there was
  one, and lose the work everywhere when validation failed anywhere.
- **Saving a value equal to the default DELETEs the row.** Storing a copy
  of the default would silently pin that string, so a later edit to
  `defaults.ts` would appear to do nothing on the live site with no way to
  see why. "Revert to original" therefore reverts rather than pins.
- **Orphans are listed with their text and removed by hand.** A key
  normally disappears because it was renamed, and the orphaned text is
  usually what belongs in its replacement — deleting it automatically
  would destroy it at the moment it is needed.

**3 · Migrate the pages** — replace hardcoded strings with `t()` calls, one
page group at a time. Each page group is its own commit so a regression is
easy to isolate.

Order changed during the work. The plan said policies first, "highest
value, lowest risk"; the second half was wrong. Policies are structured
documents — 35 sections, 49 paragraphs, 27 list items, 8 links and 9 bold
runs — so they were the group that needed a rendering decision, not the
one that needed none. Home, track, nav and footer went first because they
were plain strings, then the markdown renderer, then the policies.

Done: home, track, nav, footer (28 keys) · all four policy pages (79
keys, 38 of them markdown). Remaining: FAQ, About, contact, and the
component-level prose.

**4 · Guardrails** — the rule below, plus a script that fails CI when a
`t()` key has no default and when a default has no `t()` caller.

---

## The rule this adds

To be added to AGENTS.md as rule 13:

> **13. Visible copy is admin-editable.** Any string a visitor can read
> goes in `src/content/defaults.ts` with a key and is rendered through
> `t()` — never inline in JSX. A new paragraph that ships without a key is
> a review failure, because it can only be changed by a developer, and the
> point of the content table is that copy is not a deployment.

Enforced by `npm run check:content`, added to the pre-flight list in
"Before saying a change is done".

**Exempt, and deliberately so:** error messages tied to code paths
(`CHALLENGE_FAILED`), legally fixed strings that must not be casually
edited (the GST "pro-forma — not a tax invoice" heading), `aria-label`s,
and anything inside `/admin` itself — an admin who breaks the admin's own
copy has no way back in.

---

## Risks

**Script budget.** The content map is server-side only and adds nothing to
the client bundle. Budget must still be re-measured after phase 3 —
`npm run audit`, 190 KB per page.

**`chaos` and `test:db-down`.** These are the tests that prove rule 8.
They must pass after every phase, not just at the end.

**Editing a policy page is a legal act.** Refund and shipping terms are
representations to a customer. The audit log records who changed what, and
the reset-to-default action means a bad edit is recoverable without a
deploy.

**Key sprawl.** 43 routes and 37 components is a lot of keys. Grouping by
page in the admin, and the orphaned-key report, are what keep it navigable.

---

## What this does not do

Not versioning or scheduled publishing — the audit log records changes,
but there is no draft state or rollback beyond reset-to-default.

Not per-locale content. The key space would need a locale dimension; the
schema allows adding one later without a rewrite.

Not images. `S3_*` covers photograph uploads and is a separate concern.
