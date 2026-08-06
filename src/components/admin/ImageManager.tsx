"use client";

import { useActionState, useRef, useState } from "react";
import {
  addImageAction,
  updateImageAltAction,
  imageOrderAction,
} from "@/app/admin/catalog-actions";
import type { ActionResult } from "@/app/admin/actions";
import type { AdminImage } from "@/db/queries/catalog-admin";

const FIELD =
  "min-h-11 w-full border border-ek-green-200 bg-ek-paper px-2.5 py-1.5 text-15 text-ek-green-900 outline-none focus:border-ek-green-700";
const LABEL = "block text-15 text-ek-green-700";

function Status({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <span
      role="status"
      className={`text-15 ${state.ok ? "text-ek-green-700" : "text-ek-terracotta"}`}
    >
      {state.message}
    </span>
  );
}

/**
 * A thumbnail in the admin, deliberately a plain <img>.
 *
 * next/image would route it through /_next/image, which means the bucket's
 * hostname has to be in remotePatterns before the owner can see what they
 * just uploaded — a configuration step between adding a photograph and
 * looking at it. This is one 88px preview on a page nobody but the owner
 * can reach; it is not worth a config file.
 */
function Thumbnail({ url, alt }: { url: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      width={88}
      height={88}
      className="h-22 w-22 shrink-0 border border-ek-green-200 bg-ek-cream object-cover"
    />
  );
}

/** Read-only row, for the reorder list. */
export function ImagePreview({ image }: { image: AdminImage }) {
  return (
    <div className="flex items-start gap-3">
      <Thumbnail url={image.url} alt={image.altText} />
      <div className="min-w-0">
        <p className="truncate text-15 text-ek-green-900">
          {image.isPrimary ? "Main photograph" : "Photograph"}
        </p>
        <p className="mt-0.5 line-clamp-2 text-15 text-ek-green-700">
          {image.altText}
        </p>
      </div>
    </div>
  );
}

export function ImageRow({
  productId,
  image,
}: {
  productId: number;
  image: AdminImage;
}) {
  const [altState, altAction, savingAlt] = useActionState<
    ActionResult | null,
    FormData
  >(updateImageAltAction, null);
  const [orderState, orderAction, working] = useActionState<
    ActionResult | null,
    FormData
  >(imageOrderAction, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-wrap items-start gap-4 border-b border-ek-green-200 py-4 last:border-b-0">
      <Thumbnail url={image.url} alt={image.altText} />

      <div className="min-w-60 flex-1">
        <form action={altAction}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="imageId" value={image.id} />
          <label htmlFor={`alt-${image.id}`} className={LABEL}>
            What the photograph shows
          </label>
          <textarea
            id={`alt-${image.id}`}
            name="altText"
            rows={2}
            maxLength={400}
            defaultValue={image.altText}
            className={`${FIELD} min-h-20`}
          />
          <p className="mt-1 truncate text-15 text-ek-green-700">{image.url}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingAlt}
              className="min-h-11 cursor-pointer border border-ek-green-200 px-3 py-1.5 text-15 text-ek-green-900 transition-colors hover:border-ek-green-700 disabled:opacity-50"
            >
              {savingAlt ? "Saving…" : "Save description"}
            </button>
            <Status state={altState} />
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        {image.isPrimary ? (
          <span className="min-h-11 px-3 py-2.5 text-15 text-ek-gold-800">
            Main photograph
          </span>
        ) : (
          <form action={orderAction}>
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="imageId" value={image.id} />
            <input type="hidden" name="intent" value="primary" />
            <button
              type="submit"
              disabled={working}
              className="min-h-11 w-full cursor-pointer border border-ek-green-200 px-3 py-1.5 text-15 text-ek-green-900 transition-colors hover:border-ek-green-700 disabled:opacity-50"
            >
              Make main
            </button>
          </form>
        )}

        {confirming ? (
          <form action={orderAction} className="flex flex-col gap-2">
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="imageId" value={image.id} />
            <input type="hidden" name="intent" value="delete" />
            <button
              type="submit"
              disabled={working}
              className="min-h-11 cursor-pointer border border-ek-terracotta px-3 py-1.5 text-15 text-ek-terracotta transition-colors hover:bg-ek-terracotta hover:text-ek-cream disabled:opacity-50"
            >
              Yes, remove it
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-11 cursor-pointer text-15 text-ek-green-700 underline underline-offset-4"
            >
              Keep it
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="min-h-11 cursor-pointer border border-ek-green-200 px-3 py-1.5 text-15 text-ek-green-700 transition-colors hover:border-ek-terracotta hover:text-ek-terracotta"
          >
            Remove
          </button>
        )}

        {orderState && <Status state={orderState} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Adding                                                              */

const ACCEPTED = "image/jpeg,image/png,image/webp,image/avif";
const MAX_BYTES = 6 * 1024 * 1024;

interface UploadTicket {
  uploadUrl: string;
  publicUrl: string;
}

/**
 * Adding a photograph, by upload or by path.
 *
 * The upload goes **straight to the bucket**. This server issues a signed
 * URL and never sees the bytes, which keeps a 6 MB multipart body off a
 * route handler that would otherwise have to buffer it.
 *
 * With no bucket configured the file picker is not shown at all — an
 * upload control that fails when used is worse than one that is honestly
 * absent — and the path field remains, which is how the five launch
 * products are set up: files committed under /public/images/products.
 *
 * The description field is required by the schema and by the server. It is
 * what a screen reader announces and what shows when the image 404s, and
 * "product image" in that slot tells nobody anything.
 */
export function ImageAdder({
  productId,
  slug,
  uploadsEnabled,
}: {
  productId: number;
  slug: string;
  uploadsEnabled: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    addImageAction,
    null,
  );
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploadError(null);

    if (file.size > MAX_BYTES) {
      setUploadError(
        `That is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 6 MB — resize it first; a product photo does not need to be larger.`,
      );
      return;
    }
    if (!ACCEPTED.split(",").includes(file.type)) {
      setUploadError("JPEG, PNG, WebP or AVIF only.");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, contentType: file.type }),
      });
      if (!response.ok) throw new Error(`ticket ${response.status}`);
      const ticket = (await response.json()) as UploadTicket;

      // Straight to the bucket. The Content-Type must match the one that
      // was signed, or the storage provider rejects the PUT.
      const put = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`upload ${put.status}`);

      setUrl(ticket.publicUrl);
    } catch (error) {
      console.error("[admin] image upload failed:", error);
      setUploadError(
        "The upload did not go through. Check the storage keys, or paste a path instead.",
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="mt-8 border border-ek-green-200 bg-ek-cream p-5">
      <h3 className="font-display text-20 text-ek-green-900">
        Add a photograph
      </h3>

      {uploadsEnabled ? (
        <div className="mt-4">
          <label htmlFor="image-file" className={LABEL}>
            Choose a file
          </label>
          <input
            id="image-file"
            ref={fileInput}
            type="file"
            accept={ACCEPTED}
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            className="mt-1 block w-full text-15 text-ek-green-900 file:mr-3 file:min-h-11 file:cursor-pointer file:border file:border-ek-green-900 file:bg-transparent file:px-4 file:text-15 file:text-ek-green-900"
          />
          <p className="mt-1 text-15 text-ek-green-700">
            JPEG, PNG, WebP or AVIF, up to 6 MB. It uploads straight to
            storage — this site never holds the file.
          </p>
          {uploading && (
            <p role="status" className="mt-2 text-15 text-ek-green-700">
              Uploading…
            </p>
          )}
          {uploadError && (
            <p role="status" className="mt-2 text-15 text-ek-terracotta">
              {uploadError}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 max-w-[70ch] text-15 text-ek-green-700">
          No object storage is configured, so there is nowhere to upload to.
          Add the file under <code>public/images/products/</code> in the
          repository and give its path below — that is how the launch
          products work. Set the S3 keys in the environment and a file
          picker appears here.
        </p>
      )}

      <form action={action} className="mt-5">
        <input type="hidden" name="productId" value={productId} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="image-url" className={LABEL}>
              {uploadsEnabled ? "Or a path" : "Path"}
            </label>
            <input
              id="image-url"
              name="url"
              required
              maxLength={400}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="/images/products/example-pack.jpg"
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="image-alt" className={LABEL}>
              What it shows
            </label>
            <input
              id="image-alt"
              name="altText"
              required
              minLength={5}
              maxLength={400}
              placeholder="A 100 g pack of Kandhamal turmeric on a linen cloth"
              className={FIELD}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || uploading}
            className="min-h-11 cursor-pointer bg-ek-green-900 px-4 py-1.5 text-15 text-ek-cream transition-colors hover:bg-ek-green-700 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add photograph"}
          </button>
          <Status state={state} />
        </div>
      </form>
    </div>
  );
}
