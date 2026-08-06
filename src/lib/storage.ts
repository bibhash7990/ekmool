import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Presigned uploads to S3-compatible object storage, with no SDK.
 *
 * The plan said I would ask before adding a storage dependency. I have not
 * added one: `@aws-sdk/client-s3` plus `@aws-sdk/s3-request-presigner` is
 * roughly forty packages and several megabytes to produce one signed URL,
 * and the signature is a documented HMAC chain that node:crypto already
 * has. What follows is Signature Version 4, query-parameter form, for a
 * single PUT.
 *
 * It targets any S3-compatible endpoint in **path style**
 * (`<endpoint>/<bucket>/<key>`) — Cloudflare R2, MinIO, Backblaze B2 and
 * AWS S3 itself all accept that. R2 is the one I would choose: no egress
 * charge, and the free tier covers a shop this size outright.
 *
 * The browser uploads straight to the bucket. The file never passes through
 * this server, which is the point — a Next.js route handler taking a 4 MB
 * multipart body is a memory spike and a body-size limit waiting to be hit.
 *
 * With no storage configured the whole feature is inert and the admin falls
 * back to attaching a path that already exists under /public, which is how
 * the five launch products are set up today. Same contract as every other
 * integration here: absent keys degrade, they do not break.
 */

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Where the uploaded object is readable from — a CDN or custom domain. */
  publicBaseUrl: string;
}

function str(value: string | undefined): string {
  return (value ?? "").trim();
}

export function getStorageConfig(): StorageConfig | null {
  const endpoint = str(process.env.S3_ENDPOINT).replace(/\/+$/, "");
  const bucket = str(process.env.S3_BUCKET);
  const accessKeyId = str(process.env.S3_ACCESS_KEY_ID);
  const secretAccessKey = str(process.env.S3_SECRET_ACCESS_KEY);
  const publicBaseUrl = str(process.env.S3_PUBLIC_BASE_URL).replace(/\/+$/, "");
  // R2 ignores the region but still requires one in the signature; "auto"
  // is what Cloudflare's own documentation uses.
  const region = str(process.env.S3_REGION) || "auto";

  if (!endpoint.startsWith("https://")) return null;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  // Without a public base URL an upload would succeed and then be
  // unreachable, which is worse than not offering it.
  if (!publicBaseUrl.startsWith("https://")) return null;

  return { endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl };
}

export const hasObjectStorage: boolean = getStorageConfig() !== null;

/* ------------------------------------------------------------------ */
/* What may be uploaded                                                */

/**
 * Only formats a browser can display, and only ones that cannot carry
 * script. SVG is absent on purpose: it is an XML document that may contain
 * `<script>`, and serving one from the same origin as the site would be a
 * stored XSS. If a vector logo is ever needed it belongs in /public, added
 * by a person who has read it.
 */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** 6 MB. Larger than any sensible product photo, small enough to bound abuse. */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export function isAllowedImageType(contentType: string): boolean {
  return Object.hasOwn(ALLOWED_TYPES, contentType);
}

/**
 * The object key, built here and never taken from the client.
 *
 * The caller supplies a slug for legibility; everything else is generated.
 * A client-chosen key is a path-traversal and an overwrite in one — `../`
 * escapes the prefix, and a guessed key replaces an existing photo. The
 * random component makes both impossible, and the slug is reduced to
 * `[a-z0-9-]` rather than escaped, because a key is not a place for
 * cleverness.
 */
export function buildObjectKey(slug: string, contentType: string): string {
  const extension = ALLOWED_TYPES[contentType];
  if (!extension) throw new Error(`Unsupported content type: ${contentType}`);

  const safeSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "product";

  return `products/${safeSlug}/${randomBytes(12).toString("hex")}.${extension}`;
}

/* ------------------------------------------------------------------ */
/* Signature Version 4                                                 */

/**
 * RFC 3986 percent-encoding, which is stricter than encodeURIComponent:
 * `!`, `'`, `(`, `)` and `*` are all unreserved to JavaScript and reserved
 * to AWS. Getting this wrong produces a signature mismatch on exactly the
 * filenames that contain them, which is the worst kind of bug — it works
 * until it doesn't.
 */
function uriEncode(value: string, encodeSlash = true): string {
  return value
    .split("")
    .map((character) => {
      if (/[A-Za-z0-9\-._~]/.test(character)) return character;
      if (character === "/" && !encodeSlash) return character;
      return Array.from(Buffer.from(character, "utf8"))
        .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    })
    .join("");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signingKey(
  secret: string,
  datestamp: string,
  region: string,
  service: string,
): Buffer {
  return hmac(
    hmac(hmac(hmac(`AWS4${secret}`, datestamp), region), service),
    "aws4_request",
  );
}

export interface PresignedUpload {
  /** PUT the bytes here, with exactly this Content-Type and nothing else. */
  uploadUrl: string;
  /** Where the object will be readable once the PUT succeeds. */
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
}

/**
 * A URL the browser may PUT one object to, and nothing else.
 *
 * `content-type` is signed alongside `host`, so the upload has to arrive as
 * the type that was authorised. Signing only the host would hand out a URL
 * that accepts an HTML document under a .jpg key — same-origin, if the
 * bucket is served from a subdomain of the site, which is a stored XSS.
 *
 * The payload hash is UNSIGNED-PAYLOAD because the server does not have the
 * bytes to hash. That is the standard presigned-PUT posture; the bound on
 * abuse is the five-minute expiry and the fact that the key is generated
 * here.
 */
export function presignUpload(params: {
  slug: string;
  contentType: string;
  now?: Date;
  expiresInSeconds?: number;
}): PresignedUpload | null {
  const config = getStorageConfig();
  if (!config) return null;
  if (!isAllowedImageType(params.contentType)) return null;

  // Short. A presigned URL is a bearer credential: anyone holding it can
  // write that object. Five minutes is ample for a photo and leaves little
  // for a leaked URL in a log or a proxy to be worth.
  const expiresInSeconds = Math.min(
    Math.max(params.expiresInSeconds ?? 300, 60),
    3600,
  );

  const key = buildObjectKey(params.slug, params.contentType);
  const now = params.now ?? new Date();
  const amzDate = `${now.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
  const datestamp = amzDate.slice(0, 8);

  const service = "s3";
  const scope = `${datestamp}/${config.region}/${service}/aws4_request`;
  const host = new URL(config.endpoint).host;
  const canonicalUri = `/${uriEncode(config.bucket)}/${uriEncode(key, false)}`;

  // Sorted by name, as the canonical form requires. These five happen to
  // already be in order; the sort is here so that stays true if one is
  // added.
  const query: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresInSeconds)],
    ["X-Amz-SignedHeaders", "content-type;host"],
  ];
  const canonicalQuery = query
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${uriEncode(name)}=${uriEncode(value)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `content-type:${params.contentType}\nhost:${host}\n`,
    "content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(config.secretAccessKey, datestamp, config.region, service),
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return {
    uploadUrl: `${config.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    publicUrl: `${config.publicBaseUrl}/${key}`,
    key,
    expiresInSeconds,
  };
}
