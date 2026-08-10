import { Eyebrow } from "@/components/ui/Eyebrow";
import { ContentField, OrphanRow } from "@/components/admin/ContentField";
import {
  listContentOverrides,
  orphanedKeys,
} from "@/db/queries/content";
import {
  CONTENT_DEFAULTS,
  CONTENT_GROUPS,
  CONTENT_LABELS,
  isMarkdownKey,
  keysInGroup,
  maxLengthFor,
} from "@/content/defaults";

export const dynamic = "force-dynamic";

/**
 * Editing the words on the site.
 *
 * force-dynamic because the editor must show what is stored right now.
 * Rule 8 does not apply here — /admin is not a browsing route and is
 * already dynamic throughout — and reading the cached map instead would
 * mean the first load after a save showed the previous value, which reads
 * as a lost edit.
 *
 * Only copy that is in src/content/defaults.ts appears. A string typed
 * straight into JSX cannot be edited here and cannot be edited by the
 * owner at all, which is what rule 13 is about.
 */

const DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export default async function AdminContentPage() {
  const overrides = await listContentOverrides();
  const orphans = orphanedKeys(overrides);
  const editedCount = CONTENT_GROUPS.reduce(
    (total, group) =>
      total +
      keysInGroup(group.prefix).filter((key) => overrides.has(key)).length,
    0,
  );

  return (
    <div className="mt-8">
      <Eyebrow>Words</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">Content</h1>

      <p className="mt-5 max-w-[70ch] text-15 text-ek-green-700">
        Every editable string on the public site. A change goes live within
        the hour, or on the next visit to the page, whichever comes first —
        there is no deploy to wait for. Product names, descriptions and
        prices are not here; those live on the product itself.
      </p>

      <p className="mt-3 max-w-[70ch] text-15 text-ek-green-700">
        Anything left as its original wording is not stored at all, so it
        keeps following the code. That is why reverting a field is worth
        doing rather than retyping the old words by hand.
        {editedCount > 0 && (
          <>
            {" "}
            <span className="tabular-nums">{editedCount}</span>{" "}
            {editedCount === 1 ? "field has" : "fields have"} been changed.
          </>
        )}
      </p>

      {CONTENT_GROUPS.map((group) => {
        const keys = keysInGroup(group.prefix);
        if (keys.length === 0) return null;

        return (
          <section key={group.id} className="mt-14">
            <h2 className="font-display text-24 text-ek-green-900">
              {group.title}
            </h2>
            <p className="mt-2 max-w-[70ch] text-15 text-ek-green-700">
              {group.blurb}
            </p>

            <div className="mt-5 max-w-3xl">
              {keys.map((key) => {
                const override = overrides.get(key);
                return (
                  <ContentField
                    key={key}
                    contentKey={key}
                    label={CONTENT_LABELS[key].label}
                    hint={CONTENT_LABELS[key].hint}
                    fallback={CONTENT_DEFAULTS[key]}
                    current={override?.value ?? CONTENT_DEFAULTS[key]}
                    overridden={Boolean(override)}
                    maxLength={maxLengthFor(key)}
                    markdown={isMarkdownKey(key)}
                    updatedAt={
                      override ? DATE.format(override.updatedAt) : null
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {orphans.length > 0 && (
        <section className="mt-16 border-t border-ek-green-900 pt-8">
          <h2 className="font-display text-24 text-ek-green-900">
            Leftover fields
          </h2>
          <p className="mt-2 max-w-[70ch] text-15 text-ek-green-700">
            These were saved against fields the site no longer has, usually
            because one was renamed. Nothing here is shown to anyone. The
            wording is kept rather than removed automatically, in case it is
            what belongs in the field that replaced it — copy it across
            first, then remove it.
          </p>
          <div className="mt-5 max-w-3xl">
            {orphans.map((orphan) => (
              <OrphanRow
                key={orphan.key}
                contentKey={orphan.key}
                value={orphan.value}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
