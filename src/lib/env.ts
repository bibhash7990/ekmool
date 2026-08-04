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
