import type { Metadata } from "next";
import Link from "next/link";
import { hasClerk } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";
import { AdminSignOut } from "@/components/admin/AdminSignOut";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Two tiers, not one list of nine.
 *
 * The top row is the work: what came in, what to send, what to stock, who
 * is owed a decision. The quieter row is what you look at deliberately —
 * numbers, the customer list, and the record of who changed what. Giving
 * them equal weight would mean nine identical links and no order of
 * business at all.
 */
const PRIMARY = [
  { href: "/admin", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/stock", label: "Stock" },
  { href: "/admin/returns", label: "Returns" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/coupons", label: "Coupons" },
];

const SECONDARY = [
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/audit", label: "Activity" },
  { href: "/", label: "View site" },
];

/**
 * ClerkProvider is mounted HERE and nowhere higher. Two consequences the
 * whole graceful-degradation story depends on:
 *   - a production build with no Clerk keys never constructs a provider,
 *     so it cannot throw
 *   - public pages carry none of Clerk's client JS
 *
 * requireAdmin() 404s (not 403s) when Clerk is absent or the user lacks
 * the admin role, so this surface is invisible to everyone else.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  const { ClerkProvider, UserButton } = await import("@clerk/nextjs");

  return (
    <ClerkProvider
      appearance={{
        // Clerk 7 variable names: colorForeground / colorInput replaced
        // the older colorText / colorInputBackground.
        variables: {
          colorPrimary: "#1C3A2D",
          colorBackground: "#FAF7F0",
          colorForeground: "#1C3A2D",
          colorInput: "#FAF7F0",
          colorInputForeground: "#1C3A2D",
          colorBorder: "#C9D8CD",
          borderRadius: "2px",
        },
      }}
    >
      <div className="mx-auto max-w-[1320px] px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ek-green-200 pb-5">
          <nav aria-label="Admin">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {PRIMARY.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="link-draw font-display text-20 text-ek-green-900"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              {SECONDARY.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="link-draw text-15 text-ek-green-700"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {hasClerk && (
            <div className="flex items-center gap-4">
              <AdminSignOut />
              <UserButton />
            </div>
          )}
        </div>
        {children}
      </div>
    </ClerkProvider>
  );
}
