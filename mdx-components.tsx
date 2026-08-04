import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { SoilLine } from "@/components/ui/SoilLine";

/**
 * Brand typography for MDX prose. Defined once here rather than with a
 * prose plugin, so blog posts use the same tokens and type scale as the
 * rest of the site.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: ({ children, ...props }) => (
      <h2
        className="mt-14 font-display text-34 text-ek-green-900 first:mt-0"
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="mt-10 font-display text-26 text-ek-green-900" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }) => (
      <p className="mt-5 max-w-[68ch] text-17 text-ek-green-700" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul
        className="mt-5 max-w-[68ch] list-disc space-y-2 pl-5 text-17 text-ek-green-700 marker:text-ek-gold-500"
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol
        className="mt-5 max-w-[68ch] list-decimal space-y-2 pl-5 text-17 text-ek-green-700 marker:text-ek-green-700"
        {...props}
      >
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => <li {...props}>{children}</li>,
    a: ({ href, children, ...props }) => {
      const url = String(href ?? "");
      const isInternal = url.startsWith("/") || url.startsWith("#");
      return isInternal ? (
        <Link href={url} className="link-draw text-ek-gold-600" {...props}>
          {children}
        </Link>
      ) : (
        <a
          href={url}
          rel="noopener noreferrer"
          target="_blank"
          className="link-draw text-ek-gold-600"
          {...props}
        >
          {children}
        </a>
      );
    },
    strong: ({ children, ...props }) => (
      <strong className="font-semibold text-ek-green-900" {...props}>
        {children}
      </strong>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="mt-8 max-w-[62ch] border-l-2 border-ek-gold-500 pl-5 font-display text-20 text-ek-green-900"
        {...props}
      >
        {children}
      </blockquote>
    ),
    hr: () => <SoilLine className="my-14" />,
    table: ({ children, ...props }) => (
      <div className="mt-8 overflow-x-auto">
        <table
          className="w-full border-collapse text-left text-15"
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th
        className="border-b border-ek-green-200 py-3 pr-6 font-medium text-ek-green-900"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td
        className="border-b border-ek-green-200 py-3 pr-6 align-top text-ek-green-700"
        {...props}
      >
        {children}
      </td>
    ),
    ...components,
  };
}
