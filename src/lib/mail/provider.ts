/**
 * Mail transport contract. Swapping Brevo for Resend means writing one new
 * implementation and changing the factory in ./index.ts — nothing else.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type MailResult =
  | { status: "sent"; messageId?: string }
  | { status: "skipped_no_smtp" }
  | { status: "failed"; error: string };

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<MailResult>;
}
