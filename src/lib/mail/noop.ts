import type { MailMessage, MailProvider, MailResult } from "./provider";

/**
 * Used when no SMTP credentials are configured. Orders still complete;
 * the intended email is logged to the console and recorded in email_log
 * with status 'skipped_no_smtp', so nothing is silently lost.
 */
export class NoopMailProvider implements MailProvider {
  readonly name = "noop";

  async send(message: MailMessage): Promise<MailResult> {
    console.info(
      `[mail:skipped] no SMTP configured — would have sent "${message.subject}" to ${message.to}`,
    );
    return { status: "skipped_no_smtp" };
  }
}
