import Image from "next/image";
import Link from "next/link";
import { CartBadge } from "./CartBadge";
import { MobileNav } from "./MobileNav";
import { SearchForm } from "@/components/search/SearchForm";
import { HeartIcon } from "@/components/icons";
import { ACCOUNT_LINK, NAV_LINKS } from "@/lib/constants";

export function Header() {
  return (
    <header
      data-site-chrome
      className="sticky top-0 z-40 border-b border-ek-green-200 bg-ek-paper/95 backdrop-blur-[2px]"
    >
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3 lg:gap-6 lg:px-8">
        <div className="flex items-center gap-2">
          {/* The search form is passed in as a server-rendered child rather
              than imported inside MobileNav. MobileNav is a client
              component; anything it imports gets bundled for the browser,
              and this form deliberately ships no JavaScript at all. */}
          <MobileNav>
            <SearchForm id="mobile-nav-q" className="w-full" />
          </MobileNav>
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
          <ul className="flex items-center gap-5 lg:gap-8">
            {[...NAV_LINKS, ACCOUNT_LINK].map((link) => (
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

        <div className="flex items-center gap-2">
          {/* Below md the nav collapses and this would crowd the logo, so
              the mobile copy lives at the top of the nav panel instead. */}
          <SearchForm
            id="header-q"
            variant="compact"
            className="hidden w-40 md:flex lg:w-52"
          />
          {/* A plain link, and no saved-items count. A count would mean the
              wishlist store — and its subscription — loading on every page
              of the site, including the ones with no products on them, to
              render a number most visitors never see. The heart being
              *findable* is the part that matters. */}
          <Link
            href="/wishlist"
            aria-label="Saved items"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-ek-green-900 transition-colors hover:text-ek-green-700"
          >
            <HeartIcon className="size-6" />
          </Link>
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
