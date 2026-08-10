/**
 * Security and fidelity tests for the editable-prose renderer.
 *
 * Imports the REAL src/lib/markdown.ts — through the alias loader, the way
 * test-admin.mjs imports the query modules — and runs it through React's
 * real server renderer, asserting on the HTML a browser would receive.
 *
 * The negative cases are the reason this exists. An admin account is a
 * smaller set than "anyone", but stored copy renders on every visitor's
 * page, so a renderer that can be talked into emitting markup is stored
 * XSS on a legal page. The renderer claims a script tag cannot survive;
 * this is what makes that claim checkable.
 *
 *   npm run test:content
 */

import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "@/lib/markdown";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const html = (md) => renderToStaticMarkup(renderMarkdown(md));

console.log("\nEditable prose renderer\n");
console.log("1. Hostile input cannot become markup");
{
  const out = html('<script>alert("x")</script>\n\nAfter.');
  check("a script tag does not survive", !out.includes("<script"), out.slice(0, 140));
  check("the paragraph after it still renders", out.includes("After."), out.slice(0, 140));
}
{
  const out = html('<img src=x onerror="alert(1)">\n\nAfter.');
  check("an onerror handler does not survive", !out.includes("onerror"), out.slice(0, 140));
  check("no img element is emitted", !out.includes("<img"), out.slice(0, 140));
}
{
  const out = html("[click me](javascript:alert(1))");
  check("a javascript: URL is never an href", !out.includes("javascript:"), out);
  check("its words are kept, not deleted", out.includes("click me"), out);
}
{
  const out = html("[x](//evil.example/p)");
  check("a protocol-relative URL is refused", !out.includes("evil.example"), out);
}
{
  const out = html("[x](data:text/html;base64,PHNjcmlwdD4=)");
  check("a data: URL is refused", !out.includes("data:"), out);
}
{
  const out = html("[x](VBScript:msgbox(1))");
  check("scheme matching is case-insensitive", !out.toLowerCase().includes("vbscript"), out);
}

console.log("\n2. Legitimate formatting survives");
{
  const out = html("A **bold** and *italic* line.");
  check("bold renders", out.includes("<strong>bold</strong>"), out);
  check("italic renders", out.includes("<em>italic</em>"), out);
}
{
  const out = html("- one\n- two\n- three");
  check(
    "a bullet list renders with three items",
    out.includes("<ul>") && (out.match(/<li>/g) || []).length === 3,
    out,
  );
}
{
  const out = html("1. first\n2. second");
  check("a numbered list renders", out.includes("<ol>"), out);
}
{
  const out = html("Write to us from the [contact page](/contact).");
  check("an internal link renders", out.includes('href="/contact"'), out);
}
{
  const out = html("See [example](https://example.com).");
  check("an external link renders", out.includes('href="https://example.com"'), out);
  check("an external link carries rel=noopener", out.includes("noopener"), out);
}
{
  const out = html("Two\n\nparagraphs.");
  check("blank lines separate paragraphs", (out.match(/<p>/g) || []).length === 2, out);
}
{
  const out = html("- Damaged items — refund within **48 hours**.");
  check("bold inside a list item survives", out.includes("<strong>48 hours</strong>"), out);
}
{
  // mdast wraps every list item's content in a paragraph, including for a
  // tight list. Rendering that literally gives <li><p>one</p></li>, which
  // is not the markup these pages had before the migration — it was
  // caught by the structural half of the parity check and by nothing else.
  const out = html("- one\n- two");
  check("a tight list item has no inner paragraph", !out.includes("<li><p>"), out);
  check("its words are still there", out.includes("<li>one</li>"), out);
}
{
  // The opposite case: a genuinely loose list, where the author put blank
  // lines between items, keeps its paragraphs and the spacing they carry.
  const out = html("- one\n\n- two");
  check("a loose list item keeps its paragraph", out.includes("<li><p>"), out);
}
{
  const out = html("- first para\n\n  second para of the same item");
  check(
    "an item with two paragraphs keeps both",
    (out.match(/<p>/g) || []).length === 2,
    out,
  );
}

console.log("\n3. The design system cannot be escaped");
{
  const out = html("# Huge heading");
  check("h1 is never emitted", !out.includes("<h1"), out);
  check("it is clamped to a lower level", out.includes("<h3") || out.includes("<h4"), out);
}
{
  const out = html("![alt text](/x.png)");
  check("an image is dropped", !out.includes("<img"), out);
}
{
  const out = html("> a quotation");
  check("a block quote is dropped", !out.includes("<blockquote"), out);
}
{
  const out = html("```js\nalert(1)\n```");
  check("a code block is dropped", !out.includes("<pre") && !out.includes("<code"), out);
}

console.log("\n4. Text is escaped, not interpreted");
{
  const out = html("Prices are 5 < 6 & rising > ever.");
  check("angle brackets are escaped", out.includes("&lt;") && out.includes("&gt;"), out);
  check("ampersands are escaped", out.includes("&amp;"), out);
}
{
  const out = html("Nothing here.");
  check("plain prose renders as a paragraph", out === "<p>Nothing here.</p>", out);
}

console.log("\n5. Degenerate input does not crash");
{
  check("an empty document renders nothing", html("") === "", html(""));
  check("whitespace only renders nothing", html("   \n\n  ") === "", html("   \n\n  "));
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}
