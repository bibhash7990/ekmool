import type { StockRow } from "@/db/queries/admin";
import type { MailMessage } from "@/lib/mail/provider";
import {
  renderEmailShell,
  emailButton,
  escapeHtml,
  EMAIL_COLORS as C,
} from "./layout";

export function buildLowStockEmail(
  lowStock: StockRow[],
  recipient: string,
  appUrl: string,
): MailMessage {
  const outOfStock = lowStock.filter((row) => row.stockQty === 0);

  const rows = lowStock
    .map(
      (row) => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid ${C.GREEN_200};">
          <div style="color:${C.GREEN_900};">${escapeHtml(row.productName)}</div>
          <div style="font-size:14px;">${escapeHtml(row.packSizeLabel)} · ${escapeHtml(row.sku)}</div>
        </td>
        <td align="right" style="padding:9px 0;border-bottom:1px solid ${C.GREEN_200};white-space:nowrap;color:${row.stockQty === 0 ? "#B4572E" : C.GREEN_900};">
          ${row.stockQty} left
          <div style="font-size:13px;">threshold ${row.lowStockThreshold}</div>
        </td>
      </tr>`,
    )
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 20px;">${lowStock.length} variant${lowStock.length === 1 ? " is" : "s are"} at or below the low-stock threshold${outOfStock.length ? `, and ${outOfStock.length} ${outOfStock.length === 1 ? "is" : "are"} completely out.` : "."}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.GREEN_200};">
      ${rows}
    </table>

    ${emailButton(`${appUrl}/admin/stock`, "Open stock management")}

    <p style="margin:8px 0 0;font-size:14px;">
      Product pages refresh hourly, so a variant that just sold out may still show as available for a short while. Checkout rejects it either way — the stock check at order time is the authority.
    </p>`;

  const text = [
    `${lowStock.length} variant(s) at or below the low-stock threshold.`,
    ``,
    ...lowStock.map(
      (row) =>
        `  ${row.sku} — ${row.productName} ${row.packSizeLabel}: ${row.stockQty} left (threshold ${row.lowStockThreshold})`,
    ),
    ``,
    `Manage stock: ${appUrl}/admin/stock`,
  ].join("\n");

  return {
    to: recipient,
    subject: `Low stock: ${lowStock.length} variant${lowStock.length === 1 ? "" : "s"} need attention`,
    html: renderEmailShell({
      previewText: `${lowStock.length} variants are running low.`,
      heading: "Low stock report",
      bodyHtml,
      appUrl,
    }),
    text,
  };
}
