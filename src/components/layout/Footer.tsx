import Image from "next/image";
import Link from "next/link";
import { getContent, t } from "@/lib/content";
import { NAV_LINKS, POLICY_LINKS } from "@/lib/constants";
import { PRODUCT_SLUGS } from "@/lib/constants";
import { ConsentSettingsLink } from "@/components/consent/ConsentSettingsLink";
import { NewsletterSignup } from "./NewsletterSignup";

const PRODUCT_NAMES: Record<string, string> = {
  "kandhamal-turmeric-powder": "Kandhamal Turmeric",
  "lakadong-turmeric-powder": "Lakadong Turmeric",
  "mithila-makhana": "Mithila Makhana",
  "guntur-chilli-powder": "Guntur Chilli",
  "byadagi-chilli-powder": "Byadagi Chilli",
};

/**
 * Async because it reads editable copy. That is safe on every page: the
 * footer is rendered from the server layout, and getContent is cached and
 * tagged, so a statically generated page bakes the copy in at build time
 * and browsing still never touches MySQL.
 */
export async function Footer() {
  const content = await getContent();
  const year = new Date().getFullYear();

  return (
    <footer
      data-site-chrome
      className="grain-dark mt-auto bg-ek-green-950 text-ek-cream"
    >
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
            <p className="eyebrow mt-6 text-ek-gold-500">
              {t(content, "site.tagline")}
            </p>
            <p className="mt-4 max-w-xs text-15 text-ek-cream/75">
              {t(content, "footer.blurb")}
            </p>
          </div>

          <nav aria-label="Products">
            <h2 className="eyebrow text-ek-cream/60">
              {t(content, "footer.shop.heading")}
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {PRODUCT_SLUGS.map((slug) => (
                <li key={slug}>
                  <Link
                    href={`/products/${slug}`}
                    className="link-draw inline-flex min-h-11 items-center text-15 text-ek-cream/90 hover:text-ek-gold-500"
                  >
                    {PRODUCT_NAMES[slug]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h2 className="eyebrow text-ek-cream/60">
              {t(content, "footer.company.heading")}
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="link-draw inline-flex min-h-11 items-center text-15 text-ek-cream/90 hover:text-ek-gold-500"
                  >
                    {t(content, link.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Help and policies">
            <h2 className="eyebrow text-ek-cream/60">
              {t(content, "footer.help.heading")}
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              <li>
                <Link
                  href="/account"
                  className="link-draw inline-flex min-h-11 items-center text-15 text-ek-cream/90 hover:text-ek-gold-500"
                >
                  {t(content, "footer.help.account")}
                </Link>
              </li>
              <li>
                <Link
                  href="/track"
                  className="link-draw inline-flex min-h-11 items-center text-15 text-ek-cream/90 hover:text-ek-gold-500"
                >
                  {t(content, "footer.help.track")}
                </Link>
              </li>
              <li>
                <Link
                  href="/wishlist"
                  className="link-draw inline-flex min-h-11 items-center text-15 text-ek-cream/90 hover:text-ek-gold-500"
                >
                  {t(content, "footer.help.wishlist")}
                </Link>
              </li>
              {POLICY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="link-draw inline-flex min-h-11 items-center text-15 text-ek-cream/90 hover:text-ek-gold-500"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                {/* Rule 4(5) of the Consumer Protection (E-Commerce) Rules
                    2020 requires this to be displayed, which means findable
                    from every page, not filed on one.

                    A plain <a>, not <Link>: this sits in the footer of every
                    page, and Link prefetches the /contact route chunk the
                    moment the footer scrolls into view. Those are real
                    transferred bytes against a measured 170 KB budget, spent
                    on a link most people will never click. */}
                <a
                  href="/contact#grievance"
                  className="link-draw inline-flex min-h-11 items-center text-15 text-ek-cream/90 hover:text-ek-gold-500"
                >
                  {t(content, "footer.help.grievance")}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-14 border-t border-ek-cream/15 pt-10">
          <NewsletterSignup />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ek-cream/15 pt-8 text-15 text-ek-cream/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Ekmool. All rights reserved.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            {/* Withdrawing consent has to be as easy as giving it, so this
                sits on every page rather than inside an account area a
                guest does not have. */}
            <ConsentSettingsLink className="min-h-11 cursor-pointer text-left underline underline-offset-4 hover:text-ek-gold-500 sm:min-h-0" />
            <p>{t(content, "footer.legal.fssai")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
