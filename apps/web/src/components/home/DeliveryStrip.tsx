import Link from "next/link";

import {
  FREE_SHIPPING_THRESHOLD_PAISE,
  FLAT_SHIPPING_PAISE,
} from "@/lib/constants";
import { formatPaise } from "@/lib/money";
import { Eyebrow } from "@/components/ui/Eyebrow";
import {
  TruckIcon,
  ShieldIcon,
  CertificateIcon,
  PinIcon,
} from "@/components/icons";

/**
 * The four things a first-time buyer checks before they add anything to a
 * cart: when it arrives, how they can pay, what happens if it goes wrong,
 * and whether they can find the order again afterwards.
 *
 * The two shipping figures come from src/lib/constants.ts — the same
 * constants the cart charges from — so this panel cannot advertise a free
 * shipping threshold the checkout does not honour. Every other line here
 * restates the policy pages verbatim in substance, and each column links
 * to the page that governs it.
 *
 * No countdowns, no "only 3 left", no "24 people are viewing this". This
 * section exists to answer questions, not to manufacture a reason to hurry.
 */
const COLUMNS = [
  {
    Icon: TruckIcon,
    heading: "Delivery",
    lines: [
      `Free above ${formatPaise(FREE_SHIPPING_THRESHOLD_PAISE)}, otherwise a flat ${formatPaise(FLAT_SHIPPING_PAISE)} anywhere in India.`,
      "Packed within one working day. Metros usually two to four working days, elsewhere four to seven.",
    ],
    href: "/shipping-policy",
    linkLabel: "Shipping policy",
  },
  {
    Icon: ShieldIcon,
    heading: "Payment",
    lines: [
      "Cash on Delivery everywhere we ship, on every order.",
      "Or UPI, cards, net banking and wallets through Razorpay. Card details never reach our servers.",
    ],
    href: "/faq",
    linkLabel: "Payment questions",
  },
  {
    Icon: CertificateIcon,
    heading: "If something is wrong",
    lines: [
      "Damaged or incorrect: tell us within 48 hours with a photograph and we replace or refund it in full.",
      "You will not be asked to ship a damaged food parcel back to us.",
    ],
    href: "/refund-policy",
    linkLabel: "Refund policy",
  },
  {
    Icon: PinIcon,
    heading: "Finding your order",
    lines: [
      "No account, no password. Your order reference and the email you checked out with are enough.",
      "That same pair opens the full history, invoices and addresses.",
    ],
    href: "/track",
    linkLabel: "Track an order",
  },
] as const;

export function DeliveryStrip() {
  return (
    <section
      aria-labelledby="logistics-heading"
      className="border-y border-ek-green-200 bg-ek-cream"
    >
      <div className="mx-auto max-w-[1180px] px-5 py-16 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <Eyebrow as="h2">Before you order</Eyebrow>
          <p
            id="logistics-heading"
            className="mt-5 font-display text-34 text-ek-green-900 lg:text-46"
          >
            Delivery, payment and what happens if it goes wrong.
          </p>
        </div>

        <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {COLUMNS.map(({ Icon, heading, lines, href, linkLabel }) => (
            <li key={heading} className="border-t border-ek-green-200 pt-6">
              <Icon className="size-6 text-ek-gold-800" />
              <h3 className="mt-4 font-display text-20 text-ek-green-900">
                {heading}
              </h3>
              {lines.map((line) => (
                <p key={line} className="mt-3 text-15 text-ek-green-700">
                  {line}
                </p>
              ))}
              <Link
                href={href}
                className="link-draw mt-4 inline-block text-15 text-ek-gold-800"
              >
                {linkLabel}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
