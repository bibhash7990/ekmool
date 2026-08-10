import { requireAccount } from "@/lib/account";
import { listOrdersByEmail } from "@/db/queries/account";
import { OrderList } from "@/components/account/OrderList";

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage() {
  const { email } = await requireAccount();

  let orders: Awaited<ReturnType<typeof listOrdersByEmail>> = [];
  let loadFailed = false;
  try {
    orders = await listOrdersByEmail(email);
  } catch (error) {
    console.error("[account] order history failed:", error);
    loadFailed = true;
  }

  return (
    <section aria-labelledby="orders-heading">
      <h2
        id="orders-heading"
        className="font-display text-34 text-ek-green-900"
      >
        Order history
      </h2>
      <p className="mt-4 max-w-[54ch] text-17 text-ek-green-700">
        Everything placed with <strong>{email}</strong>. An order placed with
        a different address lives under that one — look it up and it becomes
        the account you are signed in to.
      </p>

      <div className="mt-9">
        {loadFailed ? (
          <p className="text-17 text-ek-green-700">
            We could not load your orders just now. Please try again in a
            moment.
          </p>
        ) : (
          <OrderList
            orders={orders}
            emptyMessage="No orders against this address yet."
          />
        )}
      </div>
    </section>
  );
}
