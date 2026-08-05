import Image from "next/image";
import Link from "next/link";
import { NAV_LINKS, POLICY_LINKS, SITE_TAGLINE } from "@/lib/constants";
import { PRODUCT_SLUGS } from "@/lib/constants";

const PRODUCT_NAMES: Record<string, string> = {
  "kandhamal-turmeric-powder": "Kandhamal Turmeric",
  "lakadong-turmeric-powder": "Lakadong Turmeric",
  "mithila-makhana": "Mithila Makhana",
  "guntur-chilli-powder": "Guntur Chilli",
  "byadagi-chilli-powder": "Byadagi Chilli",
};

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="grain-dark mt-auto bg-ek-green-950 text-ek-cream">
      <div className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Image
              src="/brand/ekmool-logo-reversed.svg"
              alt="Ekmool"
              width={168}
              height={147}
              className="h-[100px] w-auto"
            />
            <p className="eyebrow mt-6 text-ek-gold-500">{SITE_TAGLINE}</p>
            <p className="mt-4 max-w-xs text-15 text-ek-cream/75">
              One root, one soil. Every pack is traced to the district that
              earned its GI tag.
            </p>
          </div>

          <nav aria-label="Products">
            <h2 className="eyebrow text-ek-cream/60">Shop</h2>
            <ul className="mt-5 flex flex-col gap-3">
              {PRODUCT_SLUGS.map((slug) => (
                <li key={slug}>
                  <Link
                    href={`/products/${slug}`}
                    className="link-draw text-15 text-ek-cream/90 hover:text-ek-gold-500"
                  >
                    {PRODUCT_NAMES[slug]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="eyebrow text-ek-cream/60">Company</h2>
            <ul className="mt-5 flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="link-draw text-15 text-ek-cream/90 hover:text-ek-gold-500"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Help and policies">
            <h2 className="eyebrow text-ek-cream/60">Help</h2>
            <ul className="mt-5 flex flex-col gap-3">
              <li>
                <Link
                  href="/track"
                  className="link-draw text-15 text-ek-cream/90 hover:text-ek-gold-500"
                >
                  Track your order
                </Link>
              </li>
              {POLICY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="link-draw text-15 text-ek-cream/90 hover:text-ek-gold-500"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-ek-cream/15 pt-8 text-15 text-ek-cream/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Ekmool. All rights reserved.</p>
          <p>FSSAI licensed · Made in India</p>
        </div>
      </div>
    </footer>
  );
}
