import Link from "next/link";
import { notFound } from "next/navigation";
import { hasClerk } from "@/lib/env";
import { listOrdersByEmail } from "@/db/queries/account";
import { formatPaise } from "@/lib/money";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { ButtonLink } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AccountPage() {
  if (!hasClerk) notFound();

  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  if (!user) notFound();

  // Orders are matched by the verified email on the Clerk account, since
  // guest checkout means there is no customer_id to join on.
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const orders = email ? await listOrdersByEmail(email) : [];

  return (
    <div className="mx-auto max-w-[860px] px-5 py-12 lg:py-16">
      <Eyebrow>Your account</Eyebrow>
      <h1 className="mt-5 font-display text-46 text-ek-green-900">
        Order history
      </h1>
      <p className="mt-5 max-w-[54ch] text-17 text-ek-green-700">
        Orders placed with <strong>{email}</strong>. Orders you placed as a
        guest with a different email address will not appear here — the
        confirmation link we emailed you still works.
      </p>

      <SoilLine align="left" className="my-10 max-w-xs" />

      {orders.length === 0 ? (
        <div>
          <p className="text-17 text-ek-green-700">
            No orders yet against this email address.
          </p>
          <ButtonLink href="/products" className="mt-7">
            Browse the shop
          </ButtonLink>
        </div>
      ) : (
        <ul className="border-t border-ek-green-200">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-ek-green-200 py-5"
            >
              <div>
                <Link
                  href={`/order/${order.id}/confirmed`}
                  className="link-draw font-display text-20 text-ek-green-900"
                >
                  #{order.id.slice(-8).toUpperCase()}
                </Link>
                <p className="mt-1 text-15 text-ek-green-700">
                  {DATE_FORMAT.format(order.createdAt)} · {order.itemCount} item
                  {order.itemCount === 1 ? "" : "s"} · {order.status}
                </p>
              </div>
              <p className="text-17 tabular-nums text-ek-green-900">
                {formatPaise(order.totalPaise)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
