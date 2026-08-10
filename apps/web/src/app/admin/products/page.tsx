import Link from "next/link";
import { listProductsForAdmin } from "@/db/queries/catalog-admin";
import { reorderProductsAction } from "@/app/admin/catalog-actions";
import { ReorderList } from "@/components/admin/ReorderList";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatPaise } from "@/lib/money";
import { formatRateBps } from "@/lib/gst";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await listProductsForAdmin();
  const live = products.filter((product) => product.isActive);
  const archived = products.filter((product) => !product.isActive);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Catalogue</Eyebrow>
          <h1 className="mt-4 font-display text-34 text-ek-green-900">
            Products
          </h1>
        </div>
        <Link
          href="/admin/products/new"
          className="min-h-11 bg-ek-green-900 px-5 py-2.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700"
        >
          New product
        </Link>
      </div>

      <p className="mt-5 max-w-[70ch] text-15 text-ek-green-700">
        The order here is the order on the catalogue page and the home page.
        Drag a row, or use the arrows — both save the same thing, and nothing
        is written until you press Save.
      </p>

      {live.length === 0 ? (
        <p className="mt-10 text-17 text-ek-green-700">
          Nothing is live. Create a product, give it a pack and a photograph,
          then switch it on.
        </p>
      ) : (
        <ReorderList
          itemNoun="catalogue"
          action={reorderProductsAction}
          items={live.map((product) => ({
            id: product.id,
            label: product.name,
            node: <ProductSummary product={product} />,
          }))}
        />
      )}

      {archived.length > 0 && (
        <section className="mt-14 border-t border-ek-green-200 pt-8">
          <h2 className="eyebrow text-ek-green-700">Archived</h2>
          <p className="mt-3 max-w-[70ch] text-15 text-ek-green-700">
            Off the catalogue, out of search and refused at checkout. Every
            order that contained one still shows it — nothing here is
            deleted.
          </p>
          <ul className="mt-4 flex flex-col">
            {archived.map((product) => (
              <li
                key={product.id}
                className="border-b border-ek-green-200 py-3 opacity-70 last:border-b-0"
              >
                <ProductSummary product={product} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ProductSummary({
  product,
}: {
  product: Awaited<ReturnType<typeof listProductsForAdmin>>[number];
}) {
  const warnings = [
    product.activeVariantCount === 0 && "no packs",
    product.imageCount === 0 && "no photographs",
    !product.hsnCode && "no HSN code",
  ].filter((warning): warning is string => Boolean(warning));

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <div className="min-w-0">
        <Link
          href={`/admin/products/${product.id}`}
          className="link-draw text-17 text-ek-green-900"
        >
          {product.name}
        </Link>
        <p className="mt-0.5 text-15 text-ek-green-700">
          {product.originState} · {product.activeVariantCount} pack
          {product.activeVariantCount === 1 ? "" : "s"}
          {product.lowPricePaise !== null &&
            ` · from ${formatPaise(product.lowPricePaise)}`}{" "}
          · <span className="tabular-nums">{product.totalStock}</span> in
          stock · GST {formatRateBps(product.gstRateBps)}
        </p>
        {warnings.length > 0 && (
          <p className="mt-0.5 text-15 text-ek-terracotta">
            {warnings.join(", ")}
          </p>
        )}
      </div>
      <p className="shrink-0 text-15 text-ek-green-700">/{product.slug}</p>
    </div>
  );
}
