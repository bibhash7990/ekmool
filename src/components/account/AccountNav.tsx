"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/addresses", label: "Addresses" },
] as const;

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="mt-8 border-b border-ek-green-200">
      <ul className="-mb-px flex flex-wrap gap-x-7">
        {TABS.map((tab) => {
          const active =
            tab.href === "/account"
              ? pathname === "/account"
              : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block border-b-2 pb-3 text-17 ${
                  active
                    ? "border-ek-gold-500 text-ek-green-900"
                    : "border-transparent text-ek-green-700 hover:text-ek-green-900"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
