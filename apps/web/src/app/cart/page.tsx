import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const metadata: Metadata = {
  title: "Your cart",
  description:
    "Review the GI-tagged single-origin spices and makhana in your Ekmool cart before checking out with Cash on Delivery or secure online payment.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/cart" },
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-12 lg:px-8 lg:py-16">
      <Eyebrow>Step 1 of 2</Eyebrow>
      <h1 className="mt-5 font-display text-46 text-ek-green-900">
        Your cart
      </h1>
      <div className="mt-12">
        <CartView />
      </div>
    </div>
  );
}
