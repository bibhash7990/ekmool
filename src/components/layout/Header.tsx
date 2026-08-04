import Image from "next/image";
import Link from "next/link";
import { CartBadge } from "./CartBadge";
import { MobileNav } from "./MobileNav";
import { NAV_LINKS } from "@/lib/constants";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ek-green-200 bg-ek-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-6 px-5 py-3 lg:px-8">
        <div className="flex items-center gap-2">
          <MobileNav />
          <Link
            href="/"
            className="flex items-center"
            aria-label="Ekmool — home"
          >
            {/* Horizontal lockup on desktop, mark alone on mobile */}
            <Image
              src="/brand/ekmool-logo-horizontal.svg"
              alt="Ekmool"
              width={150}
              height={45}
              priority
              className="hidden h-11 w-auto md:block"
            />
            <Image
              src="/brand/ekmool-mark.svg"
              alt="Ekmool"
              width={32}
              height={36}
              priority
              className="h-9 w-auto md:hidden"
            />
          </Link>
        </div>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="link-draw text-17 text-ek-green-900 hover:text-ek-green-700"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <CartBadge />
      </div>
    </header>
  );
}
