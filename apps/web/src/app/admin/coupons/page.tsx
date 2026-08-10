import { listCoupons } from "@/db/queries/coupons";
import { countSubscribers } from "@/db/queries/newsletter";
import { CouponCreator, CouponRow } from "@/components/admin/CouponManager";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  const [coupons, subscribers] = await Promise.all([
    listCoupons(),
    countSubscribers().catch(() => null),
  ]);

  return (
    <div className="mt-8">
      <Eyebrow>Promotions</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">Coupons</h1>

      <p className="mt-5 max-w-[70ch] text-15 text-ek-green-700">
        A code is validated again inside the checkout transaction, against a
        locked row — so a cap of 100 means 100 even if a thousand people try
        at once. Amounts here are in rupees. A discount reduces the taxable
        value on the invoice, as GST requires, rather than being taken off
        the total afterwards.
      </p>

      <CouponCreator />

      <div className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-ek-green-900">
              {["Code", "Value", "Minimum", "Used", "Ends", ""].map((heading) => (
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
            {coupons.map((coupon) => (
              <CouponRow key={coupon.id} coupon={coupon} />
            ))}
          </tbody>
        </table>

        {coupons.length === 0 && (
          <p className="mt-6 text-17 text-ek-green-700">
            No coupons yet.
          </p>
        )}
      </div>

      {subscribers && (
        <section className="mt-14 border-t border-ek-green-200 pt-8">
          <h2 className="eyebrow text-ek-green-700">The letter</h2>
          <p className="mt-4 text-17 text-ek-green-900">
            <span className="tabular-nums">{subscribers.confirmed}</span>{" "}
            confirmed ·{" "}
            <span className="tabular-nums">{subscribers.pending}</span> waiting
            to confirm ·{" "}
            <span className="tabular-nums">{subscribers.unsubscribed}</span>{" "}
            unsubscribed
          </p>
          <p className="mt-3 max-w-[70ch] text-15 text-ek-green-700">
            Only the confirmed count is a mailing list. A pending row is
            somebody whose address was typed into a form and who has not
            clicked the link — which may mean it was not them who typed it, so
            nothing is ever sent to one beyond the single confirmation
            request.
          </p>
        </section>
      )}
    </div>
  );
}
