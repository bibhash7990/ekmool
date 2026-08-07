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
