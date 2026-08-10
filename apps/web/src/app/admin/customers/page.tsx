import { listCustomersForAdmin } from "@/db/queries/reports";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

const STAMP = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminCustomersPage() {
  const customers = await listCustomersForAdmin(500);

  return (
    <div className="mt-8">
      <Eyebrow>People</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">
        Customers
      </h1>

      <p className="mt-5 max-w-[70ch] text-15 text-ek-green-700">
        Nobody here signed up. A row appears the first time somebody checks
        out, created from the address they typed — which is why the list is
        ordered by when they last bought rather than when they joined.
      </p>

      {customers.length === 0 ? (
        <p className="mt-10 text-17 text-ek-green-700">No orders yet.</p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-ek-green-900">
                {[
                  "Customer",
                  "Orders",
                  "Spent",
                  "Last order",
                  "First seen",
                  "Marketing",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="pb-3 pr-4 text-15 font-medium text-ek-green-700"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                // An erased customer keeps a row, because the orders behind
                // it are financial records. Showing the placeholder address
                // as though it were an email would be misleading.
                const erased = customer.email.startsWith("erased+");

                return (
                  <tr
                    key={customer.id}
                    className={`border-b border-ek-green-200 ${erased ? "opacity-60" : ""}`}
                  >
                    <td className="py-3 pr-4">
                      <span className="block text-15 text-ek-green-900">
                        {erased ? "Erased at their request" : customer.name}
                      </span>
                      {!erased && (
                        <a
                          href={`mailto:${customer.email}`}
                          className="link-draw block text-15 text-ek-green-700"
                        >
                          {customer.email}
                        </a>
                      )}
                      {!erased && customer.phone && (
                        <span className="block text-15 tabular-nums text-ek-green-700">
                          {customer.phone}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-15 tabular-nums text-ek-green-700">
                      {customer.orders}
                    </td>
                    <td className="py-3 pr-4 text-15 tabular-nums text-ek-green-900">
                      {formatPaise(customer.spentPaise)}
                    </td>
                    <td className="py-3 pr-4 text-15 text-ek-green-700">
                      {customer.lastOrderAt
                        ? STAMP.format(customer.lastOrderAt)
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-15 text-ek-green-700">
                      {STAMP.format(customer.createdAt)}
                    </td>
                    <td className="py-3 pr-4 text-15 text-ek-green-700">
                      {customer.marketingOptIn ? "Yes" : "No"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 max-w-[70ch] text-15 text-ek-green-700">
        <strong className="font-medium text-ek-green-900">
          Only a Yes in the last column may be marketed to.
        </strong>{" "}
        Placing an order is not consent to receive anything else, under the
        DPDP Act or under any reading of what the customer agreed to. The
        newsletter is a separate list with its own double opt-in, on the
        Coupons page.
      </p>
    </div>
  );
}
