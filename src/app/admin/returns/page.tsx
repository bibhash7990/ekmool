import Link from "next/link";
import {
  listReturns,
  countReturnsByStatus,
  allowedTransitions,
  reasonLabel,
  RETURN_STATUS_LABELS,
  type ReturnStatus,
} from "@/db/queries/returns";
import { ReturnRow } from "@/components/admin/ReturnRow";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const dynamic = "force-dynamic";

const STATUSES: ReturnStatus[] = [
  "requested",
  "approved",
  "received",
  "refunded",
  "rejected",
];

function isReturnStatus(value: string): value is ReturnStatus {
  return (STATUSES as string[]).includes(value);
}

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status && isReturnStatus(status) ? status : undefined;

  const [returns, counts] = await Promise.all([
    listReturns(filter),
    countReturnsByStatus(),
  ]);

  return (
    <div className="mt-8">
      <Eyebrow>Operations</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">Returns</h1>

      <p className="mt-5 max-w-[70ch] text-15 text-ek-green-700">
        Oldest first, because a return that has been sitting a week matters
        more than one that arrived this morning. Every decision emails the
        customer and lands on their order timeline, so nothing moves here
        without them being told.
      </p>

      <nav aria-label="Filter by status" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/admin/returns"
              aria-current={!filter ? "page" : undefined}
              className={`inline-block rounded-sm border px-3 py-1.5 text-15 ${
                !filter
                  ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                  : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
              }`}
            >
              All
            </Link>
          </li>
          {STATUSES.map((option) => (
            <li key={option}>
              <Link
                href={`/admin/returns?status=${option}`}
                aria-current={filter === option ? "page" : undefined}
                className={`inline-block rounded-sm border px-3 py-1.5 text-15 ${
                  filter === option
                    ? "border-ek-green-900 bg-ek-green-900 text-ek-cream"
                    : "border-ek-green-200 text-ek-green-900 hover:border-ek-green-700"
                }`}
              >
                {RETURN_STATUS_LABELS[option]}{" "}
                <span className="tabular-nums opacity-70">
                  {counts[option]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {returns.length === 0 ? (
        <p className="mt-10 text-17 text-ek-green-700">
          {filter
            ? "Nothing at this stage."
            : "No returns have been raised. Good."}
        </p>
      ) : (
        <ul className="mt-8">
          {returns.map((entry) => (
            <ReturnRow
              key={entry.id}
              entry={entry}
              transitions={allowedTransitions(entry.status)}
              reasonLabel={reasonLabel(entry.reason)}
              statusLabel={RETURN_STATUS_LABELS[entry.status]}
            />
          ))}
        </ul>
      )}

      <p className="mt-10 max-w-[70ch] text-15 text-ek-green-700">
        Marking one refunded also sets the order&rsquo;s payment status,
        because a return here covers the whole order — one request per order
        is what the schema allows. Refunded and declined are final: reopening
        one means talking to the customer, not clicking something.
      </p>
    </div>
  );
}
