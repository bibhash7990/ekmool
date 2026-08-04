import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { hasRazorpay } from "@/lib/env";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Complete your Ekmool order. Cash on Delivery across India, or pay securely online by UPI, card, net banking or wallet. Free shipping over ₹499.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/checkout" },
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 py-12 lg:px-8 lg:py-16">
      <Eyebrow>Step 2 of 2</Eyebrow>
      <h1 className="mt-5 font-display text-46 text-ek-green-900">Checkout</h1>
      <div className="mt-12">
        {/* Server decides whether online payment can be offered at all. */}
        <CheckoutForm razorpayEnabled={hasRazorpay} />
      </div>
    </div>
  );
}
