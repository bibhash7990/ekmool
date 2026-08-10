import { requireAccount } from "@/lib/account";
import { listAddresses, MAX_ADDRESSES } from "@/db/queries/customers";
import { AddressBook } from "@/components/account/AddressBook";

export const dynamic = "force-dynamic";

export default async function AccountAddressesPage() {
  const { customer } = await requireAccount();

  let addresses: Awaited<ReturnType<typeof listAddresses>> = [];
  let loadFailed = false;
  if (customer) {
    try {
      addresses = await listAddresses(customer.id);
    } catch (error) {
      console.error("[account] address list failed:", error);
      loadFailed = true;
    }
  }

  return (
    <section aria-labelledby="addresses-heading">
      <h2
        id="addresses-heading"
        className="font-display text-34 text-ek-green-900"
      >
        Saved addresses
      </h2>
      <p className="mt-4 max-w-[54ch] text-17 text-ek-green-700">
        Your default fills in checkout, so ordering again is a matter of
        seconds. Editing one here never changes an order already placed.
      </p>

      <div className="mt-9">
        {!customer || loadFailed ? (
          <p className="text-17 text-ek-green-700">
            We could not load your addresses just now. Please try again in a
            moment.
          </p>
        ) : (
          <AddressBook
            addresses={addresses}
            atLimit={addresses.length >= MAX_ADDRESSES}
          />
        )}
      </div>
    </section>
  );
}
