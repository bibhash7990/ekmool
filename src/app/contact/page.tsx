import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";
import { PhotoPlaceholder } from "@/components/ui/PhotoPlaceholder";

export const metadata: Metadata = {
  title: "Contact Ekmool — Orders, Sourcing & Bulk Enquiries",
  description:
    "Reach the Ekmool team about an order, a delivery, a sourcing question or a bulk enquiry. A person reads every message, usually within one working day.",
  alternates: { canonical: "/contact" },
  openGraph: {
    url: "/contact",
    title: "Contact Ekmool | Ekmool",
    description:
      "Order help, sourcing questions and bulk enquiries — a person reads every message.",
  },
};

const CHANNELS = [
  {
    label: "Order help",
    email: "orders@ekmool.com",
    note: "Anything about an order you have already placed — changes, delays, a damaged parcel. Include your order reference and we can answer in one reply.",
  },
  {
    label: "Sourcing & products",
    email: "hello@ekmool.com",
    note: "Where a specific lot came from, curcumin figures, milling dates, or which chilli suits a dish. These are the questions we most enjoy answering.",
  },
  {
    label: "Wholesale & bulk",
    email: "trade@ekmool.com",
    note: "Restaurants, retailers, corporate gifting and anything above five kilos. Tell us volumes and timelines and we will come back with what is realistic.",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-10 lg:px-8 lg:py-14">
      <Breadcrumbs items={[{ href: "/contact", label: "Contact" }]} />

      <div className="mt-10 grid gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <div>
          <Eyebrow>Talk to us</Eyebrow>
          <h1 className="mt-5 font-display text-46 text-ek-green-900 lg:text-64">
            Get in touch
          </h1>
          <p className="mt-6 max-w-[54ch] text-20 text-ek-green-700">
            We are a small team and we answer our own email. Expect a reply
            within one working day, Monday to Saturday.
          </p>

          <SoilLine align="left" className="my-12 max-w-xs" />

          <ul className="space-y-10">
            {CHANNELS.map((channel) => (
              <li key={channel.email}>
                <h2 className="eyebrow text-ek-green-700">{channel.label}</h2>
                <p className="mt-3">
                  <a
                    href={`mailto:${channel.email}`}
                    className="link-draw font-display text-26 text-ek-green-900"
                  >
                    {channel.email}
                  </a>
                </p>
                <p className="mt-2 max-w-[58ch] text-15 text-ek-green-700">
                  {channel.note}
                </p>
              </li>
            ))}
          </ul>

          <SoilLine align="left" className="my-12 max-w-xs" />

          <section aria-labelledby="before-heading">
            <h2
              id="before-heading"
              className="font-display text-26 text-ek-green-900"
            >
              Before you write
            </h2>
            <p className="mt-4 max-w-[58ch] text-17 text-ek-green-700">
              Delivery timelines, Cash on Delivery, spice storage and our
              returns rules are all answered on the{" "}
              <Link href="/faq" className="link-draw">
                FAQ page
              </Link>
              . If you are chasing a parcel, the tracking link in your shipping
              email is more current than we are.
            </p>
          </section>
        </div>

        <aside className="lg:pt-2">
          <PhotoPlaceholder
            ratio="1 / 1"
            tone="gold"
            direction="Still life, quiet: a wooden packing table with kraft pouches, a roll of paper tape, a brass scoop and one open notebook. Warm overhead light, slight overhead angle — should feel like a small workroom, not a warehouse."
          />

          <section
            aria-labelledby="details-heading"
            className="mt-10 border border-ek-green-200 p-6"
          >
            <h2 id="details-heading" className="eyebrow text-ek-green-700">
              Business details
            </h2>
            <dl className="mt-5 space-y-4 text-15">
              <div>
                <dt className="text-ek-green-700">Trading name</dt>
                <dd className="mt-1 text-ek-green-900">
                  Ekmool — single-origin Indian foods
                </dd>
              </div>
              <div>
                <dt className="text-ek-green-700">Registered office</dt>
                <dd className="mt-1 text-ek-green-900">
                  To be published on incorporation. Full registered address,
                  GSTIN and FSSAI licence number will appear here and on every
                  invoice.
                </dd>
              </div>
              <div>
                <dt className="text-ek-green-700">Support hours</dt>
                <dd className="mt-1 text-ek-green-900">
                  Monday to Saturday, 10:00–18:00 IST
                </dd>
              </div>
              <div>
                <dt className="text-ek-green-700">We ship</dt>
                <dd className="mt-1 text-ek-green-900">
                  Across India. Not yet internationally.
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
