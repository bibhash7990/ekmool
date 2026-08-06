import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const dynamic = "force-dynamic";

export default function NewProductPage() {
  return (
    <div className="mt-8">
      <Eyebrow>Catalogue</Eyebrow>
      <h1 className="mt-4 font-display text-34 text-ek-green-900">
        A new product
      </h1>

      <p className="mt-5 max-w-[70ch] text-17 text-ek-green-900">
        This creates it switched off. Add at least one pack and one
        photograph, then publish it from its own page — a live product with
        nothing to buy is a dead end, and Google indexes dead ends.
      </p>

      <ProductForm />

      <p className="mt-10 max-w-[70ch] text-15 text-ek-green-700">
        The five launch products also carry hand-written editorial copy in{" "}
        <code>src/content/products.ts</code> — the origin story, the
        specifications table and the FAQs. A product created here has none of
        that and its page falls back to the description above, which is a
        real page and a shorter one. Adding editorial copy is still a code
        change.{" "}
        <Link href="/admin/products" className="link-draw text-ek-green-900">
          Back to products
        </Link>
      </p>
    </div>
  );
}
