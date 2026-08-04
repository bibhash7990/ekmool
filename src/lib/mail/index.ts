import "server-only";
import { hasSmtp } from "@/lib/env";
import { logEmail } from "@/db/queries/email-log";
import { BrevoSmtpProvider } from "./brevo-smtp";
import { NoopMailProvider } from "./noop";
import type { MailMessage, MailProvider, MailResult } from "./provider";

export type { MailMessage, MailProvider, MailResult };

let provider: MailProvider | null = null;

export function getMailProvider(): MailProvider {
  if (!provider) {
    provider = hasSmtp ? new BrevoSmtpProvider() : new NoopMailProvider();
  }
  return provider;
}

/**
 * Send + audit in one call. Every attempt lands in email_log — sent,
 * failed, or skipped — which is what the job dedupe logic reads.
 * Never throws: a mail failure must not roll back an order.
 */
export async function sendAndLog(
  template: string,
  message: MailMessage,
  orderId: string | null = null,
): Promise<MailResult> {
  let result: MailResult;
  try {
    result = await getMailProvider().send(message);
  } catch (error) {
    result = {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    await logEmail({
      orderId,
      template,
      recipient: message.to,
      subject: message.subject,
      status: result.status,
      error: result.status === "failed" ? result.error : null,
    });
  } catch (error) {
    console.error("[mail] failed to write email_log row:", error);
  }

  return result;
}
