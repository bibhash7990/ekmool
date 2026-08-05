import type { OrderTimelineEntry } from "@/db/queries/orders";
import { orderStatusLabel, type OrderStatus } from "@/lib/order-status";

/**
 * The journey every order takes, in order. `cancelled` is not on it — it is
 * an exit, not a stage — so a cancelled order shows its history instead of
 * a progress rail.
 */
const JOURNEY: { status: OrderStatus; label: string; blurb: string }[] = [
  { status: "pending", label: "Placed", blurb: "We have your order." },
  { status: "confirmed", label: "Confirmed", blurb: "Payment settled, order accepted." },
  { status: "packed", label: "Packed", blurb: "Milled, weighed and sealed." },
  { status: "shipped", label: "Shipped", blurb: "Handed to the courier." },
  { status: "delivered", label: "Delivered", blurb: "With you." },
];

const STAMP = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Who did a thing, said in the second person where it makes sense. The
 * actor column holds machine names ('razorpay-webhook', 'job:...'), which
 * are right for an audit trail and wrong for a customer.
 */
function describeActor(actor: string): string | null {
  if (actor === "customer") return "by you";
  if (actor === "razorpay-webhook" || actor.startsWith("job:")) return "automatically";
  return null;
}

function describeEvent(entry: OrderTimelineEntry): string {
  return entry.fromStatus ? orderStatusLabel(entry.toStatus) : "Order placed";
}

export function OrderTimeline({
  status,
  history,
}: {
  status: OrderStatus;
  history: OrderTimelineEntry[];
}) {
  const cancelled = status === "cancelled";
  const reachedIndex = JOURNEY.findIndex((step) => step.status === status);

  return (
    <div>
      {!cancelled && (
        <ol className="grid gap-0 sm:grid-cols-5">
          {JOURNEY.map((step, index) => {
            const reached = index <= reachedIndex;
            const current = index === reachedIndex;
            return (
              <li key={step.status} className="relative pt-6 sm:pt-7">
                {/* Each cell draws its own rail segment and node, so the
                    row wraps to a single column on narrow screens without
                    a stranded connector. Reached/unreached is carried by
                    the rail and the weight — never by faded text, which
                    would not survive the contrast gate. */}
                <span
                  aria-hidden
                  className={`absolute top-0 left-0 h-px w-full ${
                    reached ? "bg-ek-green-900" : "bg-ek-green-200"
                  }`}
                />
                <span
                  aria-hidden
                  className={`absolute -top-[3px] left-0 h-[7px] w-[7px] rounded-full ${
                    reached ? "bg-ek-green-900" : "bg-ek-green-200"
                  }`}
                />
                <p
                  className={`text-15 ${
                    current
                      ? "font-semibold text-ek-green-900"
                      : reached
                        ? "text-ek-green-900"
                        : "text-ek-green-700"
                  }`}
                >
                  {step.label}
                  {current && <span className="sr-only"> — current stage</span>}
                </p>
                <p className="mt-1 pr-4 text-15 text-ek-green-700">
                  {step.blurb}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      <ul className={cancelled ? "" : "mt-12 border-t border-ek-green-200 pt-2"}>
        {history.map((entry, index) => {
          const who = describeActor(entry.actor);
          const label = describeEvent(entry);
          // The opening row's note is "Order placed", which is also its
          // label. Do not say it twice.
          const note = entry.note === label ? null : entry.note;
          return (
            <li
              key={`${entry.createdAt.getTime()}-${index}`}
              className="flex flex-wrap gap-x-4 gap-y-1 border-b border-ek-green-200 py-3.5 last:border-b-0"
            >
              <time
                dateTime={entry.createdAt.toISOString()}
                className="w-36 shrink-0 text-15 tabular-nums text-ek-green-700"
              >
                {STAMP.format(entry.createdAt)}
              </time>
              <div>
                <p className="text-15 text-ek-green-900">
                  {label}
                  {who && <span className="text-ek-green-700"> · {who}</span>}
                </p>
                {note && (
                  <p className="mt-0.5 text-15 text-ek-green-700">{note}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
