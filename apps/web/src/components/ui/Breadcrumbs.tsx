import Link from "next/link";
import { appUrl } from "@/lib/env";
import { JsonLd } from "@/components/seo/JsonLd";

export interface Crumb {
  href: string;
  label: string;
}

/**
 * Breadcrumb navigation for deep pages. Emits its own BreadcrumbList
 * structured data so the visible trail and the markup can never drift.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const trail: Crumb[] = [{ href: "/", label: "Home" }, ...items];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.label,
      item: `${appUrl}${crumb.href === "/" ? "" : crumb.href}`,
    })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-15 text-ek-green-700">
          {trail.map((crumb, i) => {
            const isLast = i === trail.length - 1;
            return (
              <li key={crumb.href} className="flex items-center gap-2">
                {isLast ? (
                  <span aria-current="page" className="text-ek-green-900">
                    {crumb.label}
                  </span>
                ) : (
                  <>
                    <Link href={crumb.href} className="link-draw">
                      {crumb.label}
                    </Link>
                    <span aria-hidden="true" className="text-ek-green-200">
                      /
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
