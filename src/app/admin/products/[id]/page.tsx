import Link from "next/link";
import { notFound } from "next/navigation";

import { getProductForAdmin } from "@/db/queries/catalog-admin";
import { listAuditForEntity } from "@/db/queries/audit";
import {
  reorderVariantsAction,
  imageOrderAction,
} from "@/app/admin/catalog-actions";
import { hasObjectStorage } from "@/lib/storage";

import { ProductForm } from "@/components/admin/ProductForm";
import { PublishToggle } from "@/components/admin/PublishToggle";
import { VariantRow, VariantCreator } from "@/components/admin/VariantEditor";
import { ImageRow, ImageAdder, ImagePreview } from "@/components/admin/ImageManager";
import { ReorderList } from "@/components/admin/ReorderList";
import { Eyebrow } from "@/components/ui/Eyebrow";

export const dynamic = "force-dynamic";

const STAMP = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  const product = await getProductForAdmin(productId);
  if (!product) notFound();

  const history = await listAuditForEntity("product", productId, 12);
  const activeVariants = product.variants.filter((v) => v.isActive);

  return (
    <div className="mt-8">
      <p className="text-15 text-ek-green-700">
        <Link href="/admin/products" className="link-draw text-ek-green-900">
          Products
        </Link>{" "}
        / {product.name}
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{product.isActive ? "Live" : "Not published"}</Eyebrow>
          <h1 className="mt-4 font-display text-34 text-ek-green-900">
            {product.name}
          </h1>
        </div>
        {product.isActive && (
          <Link
            href={`/products/${product.slug}`}
            className="link-draw text-15 text-ek-green-700"
          >
            View on the site
          </Link>
        )}
      </div>

      <div className="mt-5 border-y border-ek-green-200 py-4">
        <PublishToggle
          productId={product.id}
          isActive={product.isActive}
          name={product.name}
        />
      </div>

      {!product.hasEditorialContent && (
        <p className="mt-6 max-w-[70ch] border-l-2 border-ek-gold-800 py-1 pl-4 text-15 text-ek-green-700">
          This product has no editorial entry in{" "}
          <code>src/content/products.ts</code>, so its page shows the
          description below rather than the long origin story, the
          specifications table and the FAQs the launch products carry. The
          page is real and sells; it is shorter. Adding that copy is a code
          change.
        </p>
      )}

      <ProductForm product={product} />

      {/* ---------------- Packs ---------------- */}

      <section className="mt-14 border-t border-ek-green-200 pt-8">
        <h2 className="font-display text-26 text-ek-green-900">Packs</h2>
        <p className="mt-3 max-w-[70ch] text-15 text-ek-green-700">
          Each pack is a SKU with its own price and stock. Stock is changed on
          the{" "}
          <Link href="/admin/stock" className="link-draw text-ek-green-900">
            Stock page
          </Link>{" "}
          — a restock from zero emails everyone waiting for it, and only that
          page does so.
        </p>

        {product.variants.length === 0 ? (
          <p className="mt-6 text-17 text-ek-green-700">
            No packs yet. A product cannot go live without one.
          </p>
        ) : (
          <div className="mt-6">
            {product.variants.map((variant) => (
              <VariantRow
                key={variant.id}
                productId={product.id}
                variant={variant}
              />
            ))}
          </div>
        )}

        <VariantCreator productId={product.id} />

        {activeVariants.length > 1 && (
          <div className="mt-10 border-t border-ek-green-200 pt-6">
            <h3 className="eyebrow text-ek-green-700">
              The order packs appear in
            </h3>
            <ReorderList
              itemNoun="pack"
              action={reorderVariantsAction}
              hidden={{ productId: product.id }}
              items={activeVariants.map((variant) => ({
                id: variant.id,
                label: variant.packSizeLabel,
                node: (
                  <p className="text-15 text-ek-green-900">
                    {variant.packSizeLabel}
                    <span className="ml-2 text-ek-green-700">
                      {variant.sku}
                    </span>
                  </p>
                ),
              }))}
            />
          </div>
        )}
      </section>

      {/* ---------------- Photographs ---------------- */}

      <section className="mt-14 border-t border-ek-green-200 pt-8">
        <h2 className="font-display text-26 text-ek-green-900">
          Photographs
        </h2>

        {product.images.length === 0 ? (
          <p className="mt-4 text-17 text-ek-green-700">
            None yet. A product cannot go live without at least one.
          </p>
        ) : (
          <div className="mt-4">
            {product.images.map((image) => (
              <ImageRow
                key={image.id}
                productId={product.id}
                image={image}
              />
            ))}
          </div>
        )}

        <ImageAdder
          productId={product.id}
          slug={product.slug}
          uploadsEnabled={hasObjectStorage}
        />

        {product.images.length > 1 && (
          <div className="mt-10 border-t border-ek-green-200 pt-6">
            <h3 className="eyebrow text-ek-green-700">Gallery order</h3>
            <ReorderList
              itemNoun="gallery"
              action={imageOrderAction}
              hidden={{ productId: product.id, intent: "reorder" }}
              items={product.images.map((image) => ({
                id: image.id,
                label: image.altText.slice(0, 60),
                node: <ImagePreview image={image} />,
              }))}
            />
          </div>
        )}
      </section>

      {/* ---------------- History ---------------- */}

      {history.length > 0 && (
        <section className="mt-14 border-t border-ek-green-200 pt-8">
          <h2 className="eyebrow text-ek-green-700">
            What has changed here
          </h2>
          <ul className="mt-4">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap gap-x-4 border-b border-ek-green-200 py-2.5 text-15 last:border-b-0"
              >
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="w-32 shrink-0 tabular-nums text-ek-green-700"
                >
                  {STAMP.format(entry.createdAt)}
                </time>
                <span className="text-ek-green-900">{entry.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
