/**
 * Server-side environment access + capability flags.
 *
 * Every third-party service is optional: the app must build, run, and sell
 * (COD) with none of them configured. Placeholder values fail the prefix
 * checks below and count as absent — see docs/keys-needed.md.
 *
 * Do not import this module from client components; client code may only
 * read `NEXT_PUBLIC_*` vars directly so they are inlined at build time.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

function str(v: string | undefined): string {
  return (v ?? "").trim();
}

function looksReal(v: string, prefix?: string): boolean {
  if (!v || /placeholder|changeme|your[-_]/i.test(v)) return false;
  if (prefix) return v.startsWith(prefix) && v.length > prefix.length + 4;
  return v.length > 3;
}

/* ---------- App basics ---------- */

export const appUrl: string =
  str(process.env.NEXT_PUBLIC_APP_URL) || "http://localhost:3000";

export const adminEmail: string = str(process.env.ADMIN_EMAIL);
export const cronSecret: string = str(process.env.CRON_SECRET);
export const revalidateSecret: string = str(process.env.REVALIDATE_SECRET);

/* ---------- Database ---------- */

const dbSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(3306),
  user: z.string().min(1),
  password: z.string(),
  database: z.string().min(1),
});

export type DbConfig = z.infer<typeof dbSchema>;

/**
 * Whether to negotiate TLS to MySQL. Opt-in: every managed provider
 * requires it, and the local Docker container has no certificate to
 * present, so neither default is right for both.
 */
export const dbSsl: boolean = /^(1|true|yes)$/i.test(
  str(process.env.DATABASE_SSL),
);

/**
 * PEM for providers that sign with their own CA rather than a public root.
 * Aiven issues a per-project CA, so Node's bundled trust store rejects the
 * certificate and the handshake fails with HANDSHAKE_SSL_ERROR — measured,
 * not assumed: the same connection succeeds with the PEM and fails without.
 *
 * Read as an env var rather than a checked-in file because it is per
 * project, and because a certificate committed to the repository is one
 * rotation away from being silently wrong.
 *
 * Escaped newlines are unescaped so the PEM survives a single-line env var,
 * which is the only shape Vercel's dashboard accepts.
 */
/**
 * The provider's CA, from `ca.pem` at the repository root if it is there,
 * otherwise from DATABASE_SSL_CA.
 *
 * The file wins because a PEM survives a file intact and does not survive
 * a dashboard. Vercel's env editor strips the newlines out of a pasted
 * certificate, leaving the header welded to the base64 body; OpenSSL
 * rejects it, and during `next build` the failure kills the render worker
 * before any message reaches the log. Three builds failed that way with a
 * log that simply stopped after the Turbopack banner.
 *
 * Committing it is safe: a CA certificate is public by design — it is what
 * verifies the server, and it carries no secret. The password and host
 * stay in the environment.
 *
 * readFileSync at module scope is deliberate. This module is imported once
 * per process, the file is 1.5 KB, and the alternative is threading an
 * async read through every caller of getPool for no gain.
 */
function readCaFile(): string {
  // cwd, deliberately, and the file moved to keep that true.
  //
  // ca.pem used to sit at the repository root, which was also cwd. The
  // monorepo conversion made cwd `apps/web` — on Vercel, in the standalone
  // image, and under `pnpm --filter web` — so the certificate moved to
  // apps/web/ca.pem and the relationship is exactly what it was: the file
  // sits at the app root, and the app root is cwd.
  //
  // It also has to live inside apps/web because that is Vercel's configured
  // Root Directory. A copy at the repository root would depend on "include
  // files outside root directory" staying on, which is a setting, not a
  // property of the repo.
  //
  // Resolving from import.meta.dirname would be more robust in plain Node
  // and is wrong here: this module is bundled by Next, which does not
  // guarantee import.meta survives the transform.
  //
  // A miss is quiet. readCaFile returns "" and the DATABASE_SSL_CA fallback
  // below takes over, so the failure does not appear here — it appears as a
  // handshake error somewhere further down.
  try {
    return readFileSync(join(process.cwd(), "ca.pem"), "utf8").trim();
  } catch {
    return "";
  }
}

export const dbSslCa: string =
  readCaFile() || normalisePem(str(process.env.DATABASE_SSL_CA));

/**
 * Put a PEM back into the shape OpenSSL will parse, whatever the host's
 * env editor did to it.
 *
 * Three shapes reach us. Escaped `\n` from a .env file, which is what the
 * template documents. Real newlines, from a host that preserves them. And
 * — the one that cost three silent build failures — no separators at all,
 * because Vercel's dashboard strips them, leaving the header welded to the
 * base64 body: `-----BEGIN CERTIFICATE-----MIIERDCC...`. OpenSSL rejects
 * that outright, mysql2 reports it as HANDSHAKE_SSL_ERROR, and during
 * `next build` the throw kills the render worker before the message can
 * reach the log.
 *
 * Rebuilding it is unambiguous: a PEM body is base64, so it carries no
 * spaces or newlines of its own, and re-wrapping at 64 characters is the
 * format's own convention rather than a guess.
 */
function normalisePem(raw: string): string {
  if (!raw) return "";

  const unescaped = raw.replace(/\\n/g, "\n");
  if (unescaped.includes("\n")) return unescaped;

  const match = unescaped.match(
    /^-----BEGIN ([A-Z ]+)-----(.*?)-----END \1-----$/,
  );
  if (!match) return unescaped;

  const [, label, body] = match;
  const wrapped = body.replace(/\s+/g, "").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${wrapped.join("\n")}\n-----END ${label}-----\n`;
}

export function getDbConfig(): DbConfig | null {
  const parsed = dbSchema.safeParse({
    host: str(process.env.DATABASE_HOST),
    port: str(process.env.DATABASE_PORT) || undefined,
    user: str(process.env.DATABASE_USER),
    password: str(process.env.DATABASE_PASSWORD),
    database: str(process.env.DATABASE_NAME),
  });
  return parsed.success ? parsed.data : null;
}

/* ---------- Capability flags (graceful degradation contract) ---------- */

export const hasClerk: boolean =
  looksReal(str(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY), "pk_") &&
  looksReal(str(process.env.CLERK_SECRET_KEY), "sk_");

/**
 * Clerk's hosted sign-in page, or "" when Clerk is absent.
 *
 * There is no /sign-in route in this app: mounting ClerkProvider high
 * enough to serve one would put Clerk's client JS on public pages, which
 * the script budget does not have room for. The admin area already relies
 * on the hosted page, and this is the same page.
 *
 * The host is encoded in the publishable key — base64 after the prefix,
 * with a trailing `$` — so it needs no second variable that could drift
 * out of step with the key beside it.
 *
 * That decodes to the FRONTEND API host, `<slug>.clerk.accounts.dev`,
 * which 404s on /sign-in. The hosted pages live one label shorter, at
 * `<slug>.accounts.dev`, so the `clerk.` segment is dropped rather than
 * rewritten — it sits in the middle of the host, not at the front.
 *
 * Production instances encode a custom domain instead (`clerk.example.com`)
 * and serve their pages from `accounts.example.com`, which is the same
 * transformation.
 */
function clerkAccountsHost(): string {
  if (!hasClerk) return "";
  const key = str(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  try {
    const host = Buffer.from(key.replace(/^pk_(test|live)_/, ""), "base64")
      .toString("utf8")
      .replace(/\$$/, "");
    if (!/^[a-z0-9.-]+$/i.test(host)) return "";
    return host.startsWith("clerk.")
      ? `accounts.${host.slice("clerk.".length)}`
      : host.replace(".clerk.", ".");
  } catch {
    return "";
  }
}

export const clerkSignInUrl: string = clerkAccountsHost()
  ? `https://${clerkAccountsHost()}/sign-in`
  : "";

// No clerkSignOutUrl counterpart: Clerk serves no hosted sign-out page —
// /sign-out on the accounts host is a 404, measured — so the Clerk session
// is revoked server-side in /api/account/logout instead.

export const hasRazorpay: boolean =
  looksReal(str(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID), "rzp_") &&
  looksReal(str(process.env.RAZORPAY_KEY_SECRET));

export const hasRazorpayWebhook: boolean =
  hasRazorpay && looksReal(str(process.env.RAZORPAY_WEBHOOK_SECRET));

export const hasSmtp: boolean =
  looksReal(str(process.env.SMTP_USER)) &&
  looksReal(str(process.env.SMTP_PASSWORD));

export const hasSentry: boolean = looksReal(
  str(process.env.NEXT_PUBLIC_SENTRY_DSN),
  "https://",
);

export const hasPosthog: boolean = looksReal(
  str(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  "phc_",
);

/* ---------- Mobile clients (GET /api/v1/bootstrap) ---------- */

/**
 * The oldest native build the server will still answer correctly.
 *
 * Served by `/api/v1/bootstrap`; a client below it shows a plain "this
 * version is out of date, please update" screen and stops. It exists because
 * without it the only remedy for a client that a server change has made
 * wrong is to wait for people to update on their own, which they do not.
 *
 * **It must never be used to force an update for a reason that is not a
 * correctness one.** A minimum-version wall is a serious thing to point at a
 * customer holding a phone: it takes a working app away until they are on a
 * connection and have the storage to replace it. Raise it when an old build
 * would place a wrong order, and for nothing else — not for a redesign, not
 * to retire a screen, not to move analytics.
 *
 * Default 1, which walls off nobody: builds start at 1, so an unconfigured
 * server admits every client that exists.
 */
export const minClientBuild: number = positiveInt(
  str(process.env.MOBILE_MIN_CLIENT_BUILD),
  1,
);

/**
 * What that screen says, or "" to let the app use its own wording.
 *
 * Server-side rather than in the app bundle for the obvious reason: the one
 * thing you cannot ship to a client too old to be allowed to run is a new
 * string. Empty is sent to the client as null, not as an empty message.
 */
export const olderClientMessage: string = str(
  process.env.MOBILE_MIN_CLIENT_MESSAGE,
);

/**
 * A whole positive integer, or the default.
 *
 * Deliberately a full-string match rather than `parseInt`, which reads
 * `"12abc"` as 12 and `"1e3"` as 1 — a typo would then half-apply instead of
 * being rejected. And deliberately never NaN: `NaN < minClientBuild` and
 * `NaN >= minClientBuild` are both false, so a malformed value would not
 * make the wall strict or lax, it would silently switch it off in a way no
 * log line records.
 */
function positiveInt(raw: string, fallback: number): number {
  if (!/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

/* ---------- Seller identity (tax invoices) ---------- */

/**
 * Who is selling, legally. Absent, the site still sells — invoices simply
 * come out headed **pro-forma, not a tax invoice**, which is honest.
 * Printing a made-up GSTIN on a document a customer may hand to their own
 * accountant is not an option, so there is no placeholder anywhere.
 */
export interface SellerIdentity {
  legalName: string;
  gstin: string;
  /** Decides CGST + SGST versus IGST. Must match a name in INDIAN_STATE_OPTIONS. */
  state: string;
  address: string;
  fssai: string;
}

export function getSellerIdentity(): SellerIdentity | null {
  const legalName = str(process.env.SELLER_LEGAL_NAME);
  const gstin = str(process.env.SELLER_GSTIN).toUpperCase();
  const state = str(process.env.SELLER_STATE);
  const address = str(process.env.SELLER_ADDRESS);

  // A GSTIN is 15 characters: 2 state code, 10 PAN, 1 entity, 1 'Z', 1
  // checksum. Anything else is a typo or a placeholder, and either way it
  // must not reach a document.
  const gstinLooksReal =
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin);

  if (!legalName || !state || !address || !gstinLooksReal) return null;

  return {
    legalName,
    gstin,
    state,
    address,
    fssai: str(process.env.SELLER_FSSAI),
  };
}

/** Only a configured, well-formed seller identity makes a document a tax invoice. */
export const hasSellerIdentity: boolean = getSellerIdentity() !== null;

/**
 * The seller's state for the CGST+SGST versus IGST decision — and null
 * unless the *whole* identity is present.
 *
 * This deliberately does not read SELLER_STATE on its own. Section 32 of the
 * CGST Act is unambiguous: a person who is not registered shall not collect
 * tax. So a shop without a GSTIN charges no GST, and an order placed by one
 * must record none — not a split computed from a state that happens to be
 * configured. Deriving both the storage and the document from one switch is
 * what keeps them from contradicting each other, which is a real defect this
 * had: a pro-forma reading "no GST registration is configured" while
 * printing a CGST and SGST breakdown underneath.
 */
export const sellerState: string | null = getSellerIdentity()?.state ?? null;

/* ---------- Grievance officer ---------- */

/**
 * Rule 4(5) of the Consumer Protection (E-Commerce) Rules 2020 requires
 * every e-commerce entity to appoint a grievance officer and display their
 * **name**, contact details and the redressal mechanism. The DPDP Act 2023
 * wants a contact point for data grievances too, and in a small business
 * that is the same person.
 *
 * Read from the environment because the alternative is inventing a name,
 * and a fictional officer on a statutory notice is worse than an honest
 * gap. When unset, /contact says who will be appointed and by when instead
 * of pretending someone already has been — see GrievanceOfficer.
 */
export interface GrievanceOfficer {
  name: string;
  email: string;
  phone: string;
}

export function getGrievanceOfficer(): GrievanceOfficer | null {
  const name = str(process.env.GRIEVANCE_OFFICER_NAME);
  const email = str(process.env.GRIEVANCE_OFFICER_EMAIL);
  const phone = str(process.env.GRIEVANCE_OFFICER_PHONE);
  if (!name || !email) return null;
  return { name, email, phone };
}
