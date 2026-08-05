import type { Metadata } from "next";
import Link from "next/link";

import { getSession } from "@/lib/session";
import { listOrdersByEmail } from "@/db/queries/account";
import { orderStatusLabel } from "@/lib/order-status";
import { formatPaise } from "@/lib/money";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { ButtonLink } from "@/components/ui/Button";
import { TrackOrderForm } from "@/components/account/TrackOrderForm";
import { SignOutButton } from "@/components/account/SignOutButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your order",
  description:
    "Find an Ekmool order with the reference from your confirmation and the email address you ordered with. No account needed.",
  robots: { index: false, follow: false },
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const session = await getSession();

  // The order list is a courtesy, not the point of the page: if the
  // database is unreachable the lookup form must still render.
  let orders: Awaited<ReturnType<typeof listOrdersByEmail>> = [];
  let listFailed = false;
  if (session) {
    try {
      orders = await listOrdersByEmail(session.email);
    } catch (error) {
      console.error("[track] order list failed:", error);
      listFailed = true;
    }
  }

  return (
    <div className="mx-auto max-w-[860px] px-5 py-16 lg:py-24">
      <Eyebrow>Your orders</Eyebrow>
      <h1 className="mt-5 font-display text-46 text-ek-green-900">
        {session ? "Welcome back." : "Find your order."}
      </h1>

      {session ? (
        <>
          <p className="mt-5 max-w-[54ch] text-17 text-ek-green-700">
            Showing orders placed with <strong>{session.email}</strong>.{" "}
            <SignOutButton />
          </p>

          <SoilLine align="left" className="my-10 max-w-xs" />

          {listFailed ? (
            <p className="text-17 text-ek-green-700">
              We could not load your orders just now. Please try again in a
              moment — nothing has changed.
            </p>
          ) : orders.length === 0 ? (
            <div>
              <p className="text-17 text-ek-green-700">
                No orders against this address yet.
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
                      href={`/orders/${order.id}`}
                      className="link-draw font-display text-20 text-ek-green-900"
                    >
                      #{order.id.slice(-8).toUpperCase()}
                    </Link>
                    <p className="mt-1 text-15 text-ek-green-700">
                      {DATE_FORMAT.format(order.createdAt)} · {order.itemCount}{" "}
                      item{order.itemCount === 1 ? "" : "s"} ·{" "}
                      {orderStatusLabel(order.status)}
                    </p>
                  </div>
                  <p className="text-17 tabular-nums text-ek-green-900">
                    {formatPaise(order.totalPaise)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <SoilLine align="left" className="my-12 max-w-xs" />

          <h2 className="font-display text-26 text-ek-green-900">
            Ordered with a different email?
          </h2>
          <p className="mt-3 max-w-[54ch] text-17 text-ek-green-700">
            Look it up below — that address becomes the one you are signed in
            with.
          </p>
          <div className="mt-8">
            <TrackOrderForm initialReference={ref ?? ""} />
          </div>
        </>
      ) : (
        <>
          <p className="mt-5 max-w-[54ch] text-17 text-ek-green-700">
            There is no account to sign into and no password to remember.
            Give us the reference from your confirmation and the email you
            ordered with, and everything you have bought from us is there.
          </p>

          <SoilLine align="left" className="my-10 max-w-xs" />

          <TrackOrderForm initialReference={ref ?? ""} autoFocus={!ref} />

          <p className="mt-10 max-w-[52ch] text-15 text-ek-green-700">
            Lost the confirmation email? Check your spam folder first — then{" "}
            <Link href="/contact" className="link-draw text-ek-green-900">
              get in touch
            </Link>{" "}
            with the name and mobile number you ordered with and we will find
            it for you.
          </p>
        </>
      )}
    </div>
  );
}
