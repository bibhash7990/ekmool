import "server-only";

import { createElement, type ReactNode } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, PhrasingContent } from "mdast";
import Link from "next/link";

/**
 * Editable prose, rendered as React elements.
 *
 * WHY THIS IS NOT A SANITISER PROBLEM
 *
 * The obvious way to render markdown is to convert it to an HTML string
 * and hand that to dangerouslySetInnerHTML. That needs a sanitiser, a
 * dependency to provide one, and leaves you one missed edge case away from
 * stored XSS on every page of the site — on the legal pages, no less,
 * which is where this content is going.
 *
 * This renders to React elements instead, and the consequence is the whole
 * point: there is no HTML string anywhere in the pipeline, React escapes
 * every text node by construction, and the renderer can only emit the
 * elements it has a `case` for. An unhandled node type produces nothing,
 * because there is no branch that would turn it into markup.
 *
 * Measured against a hostile document (scripts/test-markdown.mjs), the two
 * dangerous inputs are:
 *
 *   <script>…</script>       parse to an mdast node of type "html", whose
 *   <img onerror=…>          value is raw markup AS A STRING. There is no
 *                            `case "html"` below, so both vanish — they
 *                            are never parsed as markup at all.
 *
 *   [x](javascript:alert(1)) parses to a "link" with that url. safeHref
 *                            refuses any scheme that is not http(s), and
 *                            the words render without a link instead.
 *
 * So no sanitiser is needed and NO DEPENDENCY WAS ADDED. remark-parse and
 * remark-gfm are already runtime dependencies, used by the MDX blog.
 *
 * WHY createElement AND NOT JSX
 *
 * A .tsx file cannot be imported by a plain Node script — Node 22 strips
 * types from .ts but does not compile JSX — and the test that proves the
 * paragraph above has to run the real renderer, not a copy of it. Written
 * this way, scripts/test-markdown.mjs imports this exact module through
 * the existing alias loader. A renderer whose security properties were
 * asserted against a transcription would be the weakest kind of green
 * tick.
 *
 * WHAT IS DELIBERATELY NOT SUPPORTED
 *
 * Images, tables, block quotes, code blocks, h1/h2 and raw HTML. Not an
 * oversight: this renders body copy inside a page whose design system
 * already owns the type scale. An admin who can emit an <img> can change
 * page weight and layout; one who can emit an h1 puts two of them on a
 * page and breaks the document outline rule 11 depends on. The allow-list
 * is the feature.
 */

/* ------------------------------------------------------------------ */

/**
 * Absolute http(s) URLs and site-relative paths only.
 *
 * An allow-list, not a block-list. `javascript:` and `data:` are the ones
 * that matter today, but a block-list of schemes is a list somebody has to
 * keep complete forever, and the failure mode of an incomplete one is
 * silent.
 *
 * Protocol-relative `//evil.example` is refused explicitly: it starts with
 * a slash, so a naive "starts with /" test waves it through, and it loads
 * from another origin. The same trap is documented on the image URL check
 * in catalog-actions.ts.
 */
function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

const LINK_CLASS = "link-draw text-ek-green-900";

function renderPhrasing(
  nodes: PhrasingContent[],
  keyPrefix: string,
): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (node.type) {
      case "text":
        return node.value;

      case "strong":
        return createElement(
          "strong",
          { key },
          ...renderPhrasing(node.children, key),
        );

      case "emphasis":
        return createElement(
          "em",
          { key },
          ...renderPhrasing(node.children, key),
        );

      case "break":
        return createElement("br", { key });

      case "link": {
        const href = safeHref(node.url);
        const children = renderPhrasing(node.children, key);

        // A refused URL renders its text, not nothing. Deleting the words
        // would make a policy sentence read as though a clause had been
        // removed, which is worse than a missing hyperlink.
        if (!href) return createElement("span", { key }, ...children);

        // An external link leaves the origin, where Link's prefetching and
        // client navigation buy nothing — the same reasoning as the
        // grievance-officer link in the footer.
        if (href.startsWith("http")) {
          return createElement(
            "a",
            { key, href, rel: "noopener noreferrer", className: LINK_CLASS },
            ...children,
          );
        }

        return createElement(
          Link,
          { key, href, className: LINK_CLASS },
          ...children,
        );
      }

      // inlineCode, image, html and anything else: dropped. There being no
      // case here is the mechanism, not an omission — see the note above.
      default:
        return null;
    }
  });
}

function renderBlock(nodes: RootContent[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (node.type) {
      case "paragraph":
        return createElement(
          "p",
          { key },
          ...renderPhrasing(node.children, key),
        );

      case "heading":
        // Clamped to h3/h4. The page owns h1 and h2; editable copy that
        // could emit an h1 would put two on a page.
        return createElement(
          node.depth <= 1 ? "h3" : "h4",
          { key },
          ...renderPhrasing(node.children, key),
        );

      case "list":
        return createElement(
          node.ordered ? "ol" : "ul",
          { key },
          ...renderBlock(node.children, key),
        );

      case "listItem":
        return createElement("li", { key }, ...renderBlock(node.children, key));

      default:
        return null;
    }
  });
}

/**
 * Parses once and returns elements.
 *
 * Server-side only: the parser is a server dependency and must not reach a
 * client bundle. Rich content inside a client component is handled the way
 * the project rules require — render here, pass the result down as a
 * `node` prop.
 */
export function renderMarkdown(source: string): ReactNode {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source) as Root;
  return renderBlock(tree.children, "md");
}
