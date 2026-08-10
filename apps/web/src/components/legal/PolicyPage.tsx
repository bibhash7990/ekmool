import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

/** Shared shell for the four policy pages — one h1, consistent prose. */
export function PolicyPage({
  href,
  label,
  title,
  standfirst,
  updated,
  children,
}: {
  href: string;
  label: string;
  title: string;
  standfirst: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[820px] px-5 py-10 lg:py-14">
      <Breadcrumbs items={[{ href, label }]} />

      <header className="mt-10">
        <Eyebrow>Last updated {updated}</Eyebrow>
        <h1 className="mt-5 font-display text-46 text-ek-green-900">{title}</h1>
        <p className="mt-6 max-w-[60ch] text-20 text-ek-green-700">
          {standfirst}
        </p>
      </header>

      <SoilLine align="left" className="my-12 max-w-xs" />

      <div className="policy-prose">{children}</div>
    </div>
  );
}

export function PolicySection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="font-display text-26 text-ek-green-900">{heading}</h2>
      <div className="mt-4 space-y-4 text-17 text-ek-green-700 [&_a]:underline [&_a]:underline-offset-4 [&_li]:max-w-[68ch] [&_p]:max-w-[68ch] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:marker:text-ek-gold-500">
        {children}
      </div>
    </section>
  );
}
