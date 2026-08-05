import { requireAccount } from "@/lib/account";
import { ProfileForm } from "@/components/account/ProfileForm";

export const dynamic = "force-dynamic";

export default async function AccountProfilePage() {
  const { email, customer } = await requireAccount();

  return (
    <section aria-labelledby="profile-heading">
      <h2
        id="profile-heading"
        className="font-display text-34 text-ek-green-900"
      >
        Your details
      </h2>
      <p className="mt-4 max-w-[54ch] text-17 text-ek-green-700">
        These are used on your next order. Changing them here does not
        rewrite an order already placed — a delivery address has to stay
        what it was on the day.
      </p>

      <div className="mt-9">
        {customer ? (
          <ProfileForm
            email={email}
            name={customer.name}
            phone={customer.phone}
            marketingOptIn={customer.marketingOptIn}
          />
        ) : (
          <p className="text-17 text-ek-green-700">
            We could not load your details just now. Please try again in a
            moment.
          </p>
        )}
      </div>
    </section>
  );
}
