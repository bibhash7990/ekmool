import nodemailer, { type Transporter } from "nodemailer";
import type { MailMessage, MailProvider, MailResult } from "./provider";

/** Brevo SMTP relay. The transporter is created lazily and reused. */
export class BrevoSmtpProvider implements MailProvider {
  readonly name = "brevo-smtp";
  #transport: Transporter | null = null;

  #getTransport(): Transporter {
    if (this.#transport) return this.#transport;
    this.#transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: false, // STARTTLS on 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      pool: true,
      maxConnections: 3,
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
    });
    return this.#transport;
  }

  async send(message: MailMessage): Promise<MailResult> {
    try {
      const info = await this.#getTransport().sendMail({
        from: process.env.MAIL_FROM || "Ekmool <orders@ekmool.com>",
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { status: "sent", messageId: info.messageId };
    } catch (error) {
      return {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
