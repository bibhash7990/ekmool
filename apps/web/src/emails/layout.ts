/**
 * Shared branded email shell. Table-based with inline styles — the only
 * thing that renders reliably across Gmail, Outlook and Apple Mail.
 * Brand values are duplicated here as literals because email clients
 * cannot resolve CSS custom properties.
 */

const GREEN_950 = "#10241B";
const GREEN_900 = "#1C3A2D";
const GREEN_700 = "#2C523F";
const GREEN_200 = "#C9D8CD";
const GOLD_500 = "#D99A2B";
const CREAM = "#F5EFE2";
const PAPER = "#FAF7F0";

export interface EmailShellOptions {
  previewText: string;
  heading: string;
  bodyHtml: string;
  appUrl: string;
}

export function renderEmailShell({
  previewText,
  heading,
  bodyHtml,
  appUrl,
}: EmailShellOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <span style="display:none;font-size:1px;color:${PAPER};max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(previewText)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${PAPER};border:1px solid ${GREEN_200};">

        <tr><td style="background:${GREEN_950};padding:26px 32px;">
          <a href="${appUrl}" style="text-decoration:none;">
            <span style="font-family:Georgia,'Times New Roman',serif;font-size:23px;letter-spacing:0.16em;color:${CREAM};">EKMOOL</span>
          </a>
          <div style="margin-top:6px;font-family:Georgia,serif;font-size:11px;letter-spacing:0.2em;color:${GOLD_500};">SINGLE ORIGIN &middot; INDIA</div>
        </td></tr>

        <tr><td style="height:3px;background:${GOLD_500};font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:36px 32px 8px;">
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:28px;line-height:1.2;color:${GREEN_900};">${escapeHtml(heading)}</h1>
        </td></tr>

        <tr><td style="padding:0 32px 36px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${GREEN_700};">
          ${bodyHtml}
        </td></tr>

        <tr><td style="background:${GREEN_950};padding:26px 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:${CREAM};opacity:0.85;">
          <div>Ekmool &mdash; GI-tagged, single-origin Indian foods.</div>
          <div style="margin-top:10px;">
            <a href="${appUrl}/products" style="color:${GOLD_500};text-decoration:none;">Shop</a> &nbsp;&middot;&nbsp;
            <a href="${appUrl}/shipping-policy" style="color:${GOLD_500};text-decoration:none;">Shipping</a> &nbsp;&middot;&nbsp;
            <a href="${appUrl}/contact" style="color:${GOLD_500};text-decoration:none;">Contact</a>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared button style for email CTAs. */
export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;"><tr>
    <td style="background:${GOLD_500};">
      <a href="${href}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:${GREEN_950};text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr></table>`;
}

export const EMAIL_COLORS = {
  GREEN_950,
  GREEN_900,
  GREEN_700,
  GREEN_200,
  GOLD_500,
  CREAM,
  PAPER,
};
