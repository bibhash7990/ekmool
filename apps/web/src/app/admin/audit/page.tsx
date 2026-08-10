import { listAuditLog } from "@/db/queries/audit";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const dynamic = "force-dynamic";

const STAMP = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A change, in words.
 *
 * `detail` is stored as {field: {from, to}} and printing it raw would be
 * JSON on a page a person reads. Money fields are named in paise in the
 * database and shown in rupees here, for the same reason every other admin
 * screen does: 64000 is not a price anybody recognises.
 */
function describe(field: string, change: unknown): string {
  if (
    !change ||
    typeof change !== "object" ||
    !("from" in change) ||
    !("to" in change)
  ) {
    return `${field}: ${JSON.stringify(change)}`;
  }

  const { from, to } = change as { from: unknown; to: unknown };
  const money = /paise$/i.test(field);
  const show = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "nothing";
    if (money && typeof value === "number") return `₹${(value / 100).toFixed(2)}`;
    const text = String(value);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  };

  return `${field}: ${show(from)} → ${show(to)}`;
}

export default async function AdminAuditPage() {
  const entries = await listAuditLog(200);

  return (
    <div className="mt-8">
      <Eyebrow>Record</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">
        Admin activity
      </h1>

      <p className="mt-5 max-w-[70ch] text-15 text-ek-green-700">
        Every change made from these pages, newest first. Nothing in the
        application can edit or delete a line of it — there is a writer and
        there are readers, and no third function. A log the software can
        rewrite is not a record of anything.
      </p>

      {entries.length === 0 ? (
        <p className="mt-10 text-17 text-ek-green-700">
          Nothing yet. This fills up as soon as anybody changes a price, a
          status or a photograph.
        </p>
      ) : (
        <ul className="mt-8">
          {entries.map((entry) => {
            const changes = entry.detail
              ? Object.entries(entry.detail).filter(
                  ([, value]) =>
                    value &&
                    typeof value === "object" &&
                    "from" in (value as object),
                )
              : [];

            return (
              <li
                key={entry.id}
                className="flex flex-wrap gap-x-5 gap-y-1 border-b border-ek-green-200 py-3.5 last:border-b-0"
              >
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="w-44 shrink-0 text-15 tabular-nums text-ek-green-700"
                >
                  {STAMP.format(entry.createdAt)}
                </time>
                <div className="min-w-0 flex-1">
                  <p className="text-15 text-ek-green-900">{entry.summary}</p>
                  <p className="mt-0.5 text-15 text-ek-green-700">
                    {entry.action} · {entry.entityType} {entry.entityId}
                  </p>
                  {changes.length > 0 && (
                    <ul className="mt-1">
                      {changes.map(([field, change]) => (
                        <li key={field} className="text-15 text-ek-green-700">
                          {describe(field, change)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
