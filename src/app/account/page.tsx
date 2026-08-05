import Link from "next/link";

import { requireAccount } from "@/lib/account";
import { listOrdersByEmail } from "@/db/queries/account";
import { listAddresses } from "@/db/queries/customers";
import { OrderList } from "@/components/account/OrderList";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { email, customer } = await requireAccount();

  let orders: Awaited<ReturnType<typeof listOrdersByEmail>> = [];
  let addresses: Awaited<ReturnType<typeof listAddresses>> = [];
  let loadFailed = false;

  try {
    orders = await listOrdersByEmail(email);
    if (customer) addresses = await listAddresses(customer.id);
  } catch (error) {
    console.error("[account] overview load failed:", error);
    loadFailed = true;
  }

  if (loadFailed) {
    return (
      <p className="text-17 text-ek-green-700">
        We could not load your account just now. Nothing has changed — please
        try again in a moment.
      </p>
    );
  }

  // listAddresses sorts the default first.
  const defaultAddress = addresses[0] ?? null;
  const openOrders = orders.filter(
    (order) => order.status !== "delivered" && order.status !== "cancelled",
  );

  return (
    <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="eyebrow text-ek-green-700">
          {openOrders.length > 0 ? "On the way" : "Recent orders"}
        </h2>
        <div className="mt-6">
          <OrderList
            orders={(openOrders.length > 0 ? openOrders : orders).slice(0, 3)}
            emptyMessage="You have not ordered from us yet."
          />
        </div>
        {orders.length > 3 && (
          <Link
            href="/account/orders"
            className="link-draw mt-6 inline-block text-17 text-ek-green-900"
          >
            All {orders.length} orders
          </Link>
        )}
      </section>

      <aside className="space-y-10">
        <section aria-labelledby="details-heading">
          <h2 id="details-heading" className="eyebrow text-ek-green-700">
            Your details
          </h2>
          <p className="mt-5 text-17 text-ek-green-900">
            {customer?.name ?? "—"}
            <span className="mt-1 block text-15 text-ek-green-700">
              {customer?.phone ?? "No phone number saved"}
            </span>
          </p>
          <Link
            href="/account/profile"
            className="link-draw mt-4 inline-block text-15 text-ek-green-900"
          >
            Edit your details
          </Link>
        </section>

        <section aria-labelledby="address-heading">
          <h2 id="address-heading" className="eyebrow text-ek-green-700">
            Default address
          </h2>
          {defaultAddress ? (
            <address className="mt-5 text-15 leading-relaxed text-ek-green-700 not-italic">
              <span className="block text-17 text-ek-green-900">
                {defaultAddress.label}
              </span>
              {defaultAddress.line1}
              <br />
              {defaultAddress.city}, {defaultAddress.state}{" "}
              {defaultAddress.pincode}
            </address>
          ) : (
            <p className="mt-5 max-w-[36ch] text-15 text-ek-green-700">
              Save one and checkout fills itself in next time.
            </p>
          )}
          <Link
            href="/account/addresses"
            className="link-draw mt-4 inline-block text-15 text-ek-green-900"
          >
            {addresses.length > 0
              ? `Manage ${addresses.length} address${addresses.length === 1 ? "" : "es"}`
              : "Add an address"}
          </Link>
        </section>
      </aside>
    </div>
  );
}
