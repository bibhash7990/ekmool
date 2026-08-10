"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { revalidateCatalog } from "@/lib/revalidate";
import { GST_RATE_OPTIONS } from "@ekmool/core/gst";
import { recordAdminAction, diffFields } from "@/db/queries/audit";
import {
  createProduct,
  updateProduct,
  setProductActive,
  reorderProducts,
  createVariant,
  updateVariant,
  setVariantActive,
  reorderVariants,
  addProductImage,
  updateImageAlt,
  setPrimaryImage,
  deleteProductImage,
  reorderImages,
  SlugLockedError,
  type ProductInput,
} from "@/db/queries/catalog-admin";
import type { ActionResult } from "./actions";

/**
 * Catalogue writes.
 *
 * Separate from actions.ts, which is orders, stock, reviews and coupons.
 * One file holding every admin action in the application would be a
 * thousand lines and nobody would find anything in it.
 *
 * Three habits repeat below and are deliberate:
 *
 * 1. **Rupees in, paise out.** Every money field on every admin form is
 *    rupees, and the conversion happens here — the same rule the coupon
 *    forms follow. Asking a human to type 64000 for ₹640 is how a product
 *    ships at a hundred times its price.
 * 2. **Audit after commit.** recordAdminAction runs once the write has
 *    succeeded and never throws, so a logging failure cannot turn a
 *    successful save into an error the owner sees and retries.
 * 3. **revalidateCatalog on anything a shopper can see.** Via the tag, never
 *    revalidatePath on a product route — see src/lib/revalidate.ts for the
 *    404 that caused.
 */

/* ------------------------------------------------------------------ */
/* Shared parsing                                                      */

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Lowercase letters, digits and single hyphens — no spaces",
  )
  .min(3)
  .max(120);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const productSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(3, "A product needs a name").max(160),
  originState: z.string().trim().min(2, "Where is it from?").max(80),
  giTagName: z.string().trim().min(2, "Name the GI tag").max(120),
  shortDescription: z
    .string()
    .trim()
    .min(10, "The short description is what appears on the catalogue card")
    .max(400),
  longDescription: z.string().trim().min(20, "Say more than that").max(20000),
  accent: z.enum(["gold", "terracotta", "green"]),
  // Four to eight digits. An HSN code is numeric; anything else on a tax
  // invoice is a rejected return, so it is refused here rather than stored.
  hsnCode: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "An HSN code is 4 to 8 digits")
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  gstRatePercent: z.coerce
    .number()
    .refine(
      (value) => (GST_RATE_OPTIONS as readonly number[]).includes(value),
      "Pick one of the GST slabs",
    ),
  seoTitle: optionalText(70),
  seoDescription: optionalText(180),
});

function toProductInput(
  parsed: z.infer<typeof productSchema>,
): ProductInput {
  return {
    slug: parsed.slug,
    name: parsed.name,
    originState: parsed.originState,
    giTagName: parsed.giTagName,
    shortDescription: parsed.shortDescription,
    longDescription: parsed.longDescription,
    accent: parsed.accent,
    hsnCode: parsed.hsnCode,
    gstRateBps: parsed.gstRatePercent * 100,
    seoTitle: parsed.seoTitle,
    seoDescription: parsed.seoDescription,
  };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the fields and try again.";
}

/** Rupees to paise, via Math.round so 558.55 does not become 55854. */
function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/* ------------------------------------------------------------------ */
/* Products                                                            */

export async function createProductAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const input = toProductInput(parsed.data);
  let id: number;

  try {
    id = await createProduct(input);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY") {
      return { ok: false, message: `The slug ${input.slug} is already taken.` };
    }
    console.error("[admin] product creation failed:", error);
    return { ok: false, message: "Could not create that product." };
  }

  await recordAdminAction({
    actor: userId,
    action: "product.create",
    entityType: "product",
    entityId: id,
    summary: `Created ${input.name} (${input.slug}), switched off`,
  });

  revalidatePath("/admin/products");
  // No revalidateCatalog: the product is created inactive, so nothing a
  // shopper can reach has changed yet. Publishing is what purges the cache.
  redirect(`/admin/products/${id}`);
}

export async function updateProductAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "Unknown product." };
  }

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const input = toProductInput(parsed.data);

  try {
    const before = await updateProduct(id, input);
    if (!before) return { ok: false, message: "Product not found." };

    const detail = diffFields(
      {
        slug: before.slug,
        name: before.name,
        originState: before.originState,
        giTagName: before.giTagName,
        shortDescription: before.shortDescription,
        longDescription: before.longDescription,
        accent: before.accent,
        hsnCode: before.hsnCode,
        gstRateBps: before.gstRateBps,
        seoTitle: before.seoTitle,
        seoDescription: before.seoDescription,
      },
      input,
    );

    if (Object.keys(detail).length === 0) {
      return { ok: true, message: "Nothing changed." };
    }

    await recordAdminAction({
      actor: userId,
      action: "product.update",
      entityType: "product",
      entityId: id,
      summary: `Edited ${input.name}: ${Object.keys(detail).join(", ")}`,
      detail,
    });

    if (before.isActive) revalidateCatalog();
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");

    return {
      ok: true,
      message: before.isActive
        ? "Saved. Live on the site within the hour, or on the next request."
        : "Saved. Still switched off, so nobody can see it yet.",
    };
  } catch (error) {
    if (error instanceof SlugLockedError) {
      const { orderItems, reviews, wishlists } = error.references;
      const held = [
        orderItems > 0 && `${orderItems} order line${orderItems === 1 ? "" : "s"}`,
        reviews > 0 && `${reviews} review${reviews === 1 ? "" : "s"}`,
        wishlists > 0 && `${wishlists} wishlist${wishlists === 1 ? "" : "s"}`,
      ]
        .filter((part): part is string => Boolean(part))
        .join(", ");
      return {
        ok: false,
        message: `The web address cannot change — ${held} point at the current one, and the old URL is indexed. Nothing was saved.`,
      };
    }
    if (error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY") {
      return { ok: false, message: `The slug ${input.slug} is already taken.` };
    }
    console.error("[admin] product update failed:", error);
    return { ok: false, message: "Could not save that. Try again." };
  }
}

export async function setProductActiveAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: "Unknown product." };
  }

  try {
    const result = await setProductActive(id, active);

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return { ok: false, message: "Product not found." };
        case "no_active_variant":
          return {
            ok: false,
            message:
              "Add at least one pack first — a live product with nothing to buy is a dead end.",
          };
        case "no_image":
          return {
            ok: false,
            message:
              "Add a photograph first. A product card with a placeholder on it does not sell.",
          };
      }
    }

    await recordAdminAction({
      actor: userId,
      action: active ? "product.publish" : "product.archive",
      entityType: "product",
      entityId: id,
      summary: `${active ? "Published" : "Archived"} ${result.slug}`,
    });

    revalidateCatalog();
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${id}`);

    return {
      ok: true,
      message: active
        ? "Live. It is on the catalogue, in search and buyable."
        : "Archived. Gone from the catalogue and from checkout; every past order keeps it.",
    };
  } catch (error) {
    console.error("[admin] product publish toggle failed:", error);
    return { ok: false, message: "Could not change that." };
  }
}

/**
 * Ordering, from a drag or from the keyboard.
 *
 * Both paths post the same thing — the full list of ids, in the order they
 * should now appear — so there is one server-side notion of what a reorder
 * is and no chance of the two disagreeing.
 */
const orderSchema = z.object({
  ids: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    )
    .refine((ids) => ids.length > 0, "Nothing to reorder")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "The same item appears twice",
    ),
});

export async function reorderProductsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = orderSchema.safeParse({ ids: formData.get("ids") });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    const moved = await reorderProducts(parsed.data.ids);
    await recordAdminAction({
      actor: userId,
      action: "product.reorder",
      entityType: "catalogue",
      entityId: "products",
      summary: `Reordered ${moved} products`,
      detail: { order: parsed.data.ids },
    });

    revalidateCatalog();
    revalidatePath("/admin/products");
    return { ok: true, message: "Order saved." };
  } catch (error) {
    console.error("[admin] product reorder failed:", error);
    return { ok: false, message: "Could not save that order." };
  }
}

/* ------------------------------------------------------------------ */
/* Variants                                                            */

const variantSchema = z
  .object({
    productId: z.coerce.number().int().positive(),
    variantId: z.coerce.number().int().positive().optional(),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,64}$/, "Letters, digits and hyphens only"),
    packSizeLabel: z.string().trim().min(1, "Label the pack").max(40),
    packSizeGrams: z.coerce.number().int().positive().max(100000),
    priceRupees: z.coerce.number().positive("A price is required").max(1000000),
    mrpRupees: z.coerce.number().positive("An MRP is required").max(1000000),
    lowStockThreshold: z.coerce.number().int().min(0).max(10000).default(10),
    stockQty: z.coerce.number().int().min(0).max(100000).optional(),
  })
  .refine((value) => value.mrpRupees >= value.priceRupees, {
    message:
      "MRP cannot be below the selling price — Legal Metrology requires the printed MRP to be the maximum",
    path: ["mrpRupees"],
  });

export async function saveVariantAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = variantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  const input = parsed.data;
  const shared = {
    sku: input.sku,
    packSizeLabel: input.packSizeLabel,
    packSizeGrams: input.packSizeGrams,
    pricePaise: toPaise(input.priceRupees),
    mrpPaise: toPaise(input.mrpRupees),
    lowStockThreshold: input.lowStockThreshold,
  };

  try {
    if (input.variantId) {
      const before = await updateVariant(
        input.productId,
        input.variantId,
        shared,
      );
      if (!before) return { ok: false, message: "Pack not found." };

      const detail = diffFields(
        {
          sku: before.sku,
          packSizeLabel: before.packSizeLabel,
          packSizeGrams: before.packSizeGrams,
          pricePaise: before.pricePaise,
          mrpPaise: before.mrpPaise,
          lowStockThreshold: before.lowStockThreshold,
        },
        shared,
      );

      if (Object.keys(detail).length === 0) {
        return { ok: true, message: "Nothing changed." };
      }

      await recordAdminAction({
        actor: userId,
        action: "variant.update",
        entityType: "variant",
        entityId: input.variantId,
        summary: `Edited ${before.sku}: ${Object.keys(detail).join(", ")}`,
        detail,
      });
    } else {
      const id = await createVariant(input.productId, {
        ...shared,
        stockQty: input.stockQty ?? 0,
      });
      await recordAdminAction({
        actor: userId,
        action: "variant.create",
        entityType: "variant",
        entityId: id,
        summary: `Added pack ${input.sku} (${input.packSizeLabel}) at ₹${input.priceRupees}`,
        detail: { productId: input.productId, stockQty: input.stockQty ?? 0 },
      });
    }

    revalidateCatalog();
    revalidatePath(`/admin/products/${input.productId}`);
    revalidatePath("/admin/stock");

    return {
      ok: true,
      message: input.variantId
        ? "Pack saved."
        : "Pack added. Set its stock on the Stock page when it is ready to sell.",
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ER_DUP_ENTRY") {
      return { ok: false, message: `The SKU ${input.sku} is already in use.` };
    }
    console.error("[admin] variant save failed:", error);
    return { ok: false, message: "Could not save that pack." };
  }
}

export async function setVariantActiveAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const productId = Number(formData.get("productId"));
  const variantId = Number(formData.get("variantId"));
  const active = formData.get("active") === "1";
  if (!Number.isInteger(productId) || !Number.isInteger(variantId)) {
    return { ok: false, message: "Unknown pack." };
  }

  try {
    const result = await setVariantActive(productId, variantId, active);
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.reason === "not_found"
            ? "Pack not found."
            : "This is the only pack a live product has. Archive the product instead, or add another pack first.",
      };
    }

    await recordAdminAction({
      actor: userId,
      action: active ? "variant.restore" : "variant.archive",
      entityType: "variant",
      entityId: variantId,
      summary: `${active ? "Restored" : "Archived"} pack ${result.sku}`,
    });

    revalidateCatalog();
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/admin/stock");

    return {
      ok: true,
      message: active
        ? "Pack restored."
        : "Pack archived. It is off the site; orders that contained it are untouched.",
    };
  } catch (error) {
    console.error("[admin] variant archive failed:", error);
    return { ok: false, message: "Could not change that." };
  }
}

export async function reorderVariantsAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const productId = Number(formData.get("productId"));
  const parsed = orderSchema.safeParse({ ids: formData.get("ids") });
  if (!Number.isInteger(productId) || !parsed.success) {
    return {
      ok: false,
      message: parsed.success ? "Unknown product." : firstIssue(parsed.error),
    };
  }

  try {
    const moved = await reorderVariants(productId, parsed.data.ids);
    await recordAdminAction({
      actor: userId,
      action: "variant.reorder",
      entityType: "product",
      entityId: productId,
      summary: `Reordered ${moved} packs`,
      detail: { order: parsed.data.ids },
    });

    revalidateCatalog();
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "Pack order saved." };
  } catch (error) {
    console.error("[admin] variant reorder failed:", error);
    return { ok: false, message: "Could not save that order." };
  }
}

/* ------------------------------------------------------------------ */
/* Images                                                              */

const imageSchema = z.object({
  productId: z.coerce.number().int().positive(),
  url: z
    .string()
    .trim()
    .min(1, "Where is the image?")
    .max(400)
    .refine(
      (value) => value.startsWith("/") || value.startsWith("https://"),
      "Use a path under /images or an https:// URL",
    )
    // `//evil.example/x.jpg` is protocol-relative: it starts with a slash
    // and loads from another origin. Rejected explicitly, because the check
    // above would wave it through.
    .refine((value) => !value.startsWith("//"), "That is not a local path"),
  altText: z
    .string()
    .trim()
    .min(5, "Describe the photograph — a screen reader reads this aloud")
    .max(400),
});

export async function addImageAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const parsed = imageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error) };
  }

  try {
    const id = await addProductImage(parsed.data.productId, {
      url: parsed.data.url,
      altText: parsed.data.altText,
    });

    await recordAdminAction({
      actor: userId,
      action: "image.add",
      entityType: "product",
      entityId: parsed.data.productId,
      summary: `Added an image`,
      detail: { imageId: id, url: parsed.data.url },
    });

    revalidateCatalog();
    revalidatePath(`/admin/products/${parsed.data.productId}`);
    return { ok: true, message: "Image added." };
  } catch (error) {
    console.error("[admin] image add failed:", error);
    return { ok: false, message: "Could not add that image." };
  }
}

export async function updateImageAltAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const productId = Number(formData.get("productId"));
  const imageId = Number(formData.get("imageId"));
  const altText = String(formData.get("altText") ?? "").trim();

  if (!Number.isInteger(productId) || !Number.isInteger(imageId)) {
    return { ok: false, message: "Unknown image." };
  }
  if (altText.length < 5 || altText.length > 400) {
    return {
      ok: false,
      message: "Describe the photograph — a screen reader reads this aloud.",
    };
  }

  try {
    const changed = await updateImageAlt(productId, imageId, altText);
    if (!changed) return { ok: false, message: "Image not found." };

    await recordAdminAction({
      actor: userId,
      action: "image.alt",
      entityType: "product",
      entityId: productId,
      summary: "Changed an image description",
      detail: { imageId },
    });

    revalidateCatalog();
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "Description saved." };
  } catch (error) {
    console.error("[admin] image alt update failed:", error);
    return { ok: false, message: "Could not save that." };
  }
}

export async function imageOrderAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requireAdmin();

  const productId = Number(formData.get("productId"));
  const intent = String(formData.get("intent") ?? "");
  if (!Number.isInteger(productId)) {
    return { ok: false, message: "Unknown product." };
  }

  try {
    if (intent === "primary") {
      const imageId = Number(formData.get("imageId"));
      const changed = await setPrimaryImage(productId, imageId);
      if (!changed) return { ok: false, message: "Image not found." };

      await recordAdminAction({
        actor: userId,
        action: "image.primary",
        entityType: "product",
        entityId: productId,
        summary: "Changed the main photograph",
        detail: { imageId },
      });
    } else if (intent === "delete") {
      const imageId = Number(formData.get("imageId"));
      const removed = await deleteProductImage(productId, imageId);
      if (!removed) return { ok: false, message: "Image not found." };

      await recordAdminAction({
        actor: userId,
        action: "image.delete",
        entityType: "product",
        entityId: productId,
        summary: "Removed an image",
        detail: { imageId },
      });
    } else if (intent === "reorder") {
      const parsed = orderSchema.safeParse({ ids: formData.get("ids") });
      if (!parsed.success) {
        return { ok: false, message: firstIssue(parsed.error) };
      }
      await reorderImages(productId, parsed.data.ids);

      await recordAdminAction({
        actor: userId,
        action: "image.reorder",
        entityType: "product",
        entityId: productId,
        summary: "Reordered the photographs",
        detail: { order: parsed.data.ids },
      });
    } else {
      return { ok: false, message: "Unknown action." };
    }

    revalidateCatalog();
    revalidatePath(`/admin/products/${productId}`);
    return { ok: true, message: "Saved." };
  } catch (error) {
    console.error("[admin] image order action failed:", error);
    return { ok: false, message: "Could not do that." };
  }
}
