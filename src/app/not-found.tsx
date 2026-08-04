import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { SoilLine } from "@/components/ui/SoilLine";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="mx-auto max-w-[720px] px-5 py-24 lg:py-36">
      <Eyebrow>Error 404</Eyebrow>
      <h1 className="mt-6 font-display text-46 text-ek-green-900">
        This row was never planted.
      </h1>
      <p className="mt-6 text-17 text-ek-green-700">
        The page you asked for doesn&apos;t exist — it may have been moved, or
        the link may have a typo. The five origins are all still where you left
        them.
      </p>
      <SoilLine align="left" className="my-10 max-w-xs" />
      <div className="flex flex-wrap items-center gap-6">
        <ButtonLink href="/products">Browse the shop</ButtonLink>
        <Link href="/" className="link-draw text-17 text-ek-green-900">
          Back to home
        </Link>
      </div>
    </section>
  );
}
