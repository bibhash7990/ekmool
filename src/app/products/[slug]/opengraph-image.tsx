import { ImageResponse } from "next/og";
import { getCatalog } from "@/db/queries/products";
import { getProductContent, PRODUCT_CONTENT } from "@/content/products";
import { formatPaise } from "@/lib/money";

export const alt = "Ekmool — GI-tagged single origin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card for a product page.
 *
 * Generated at build time alongside the page itself — `dynamicParams` is
 * false on this route, so these are five files baked into the output, not
 * five renders a crawler triggers.
 *
 * **Typeset in Georgia rather than Marcellus, on purpose.** `next/font`
 * self-hosts the real display face into a hashed path under
 * `.next/static/media` with no stable name to reference, and the
 * alternatives are worse: fetching the font from Google during the build
 * makes a successful build depend on a third party being up, and checking
 * a binary into the repo to satisfy one image is a poor trade. Georgia is
 * already the display fallback in every email this site sends, so the two
 * are at least consistent with each other.
 */
/**
 * Without this the image is a dynamic route: every crawler that looks at a
 * share card renders one on the origin. The page beside it is prerendered
 * from the same list, so the card should be too.
 */
export function generateStaticParams() {
  return Object.keys(PRODUCT_CONTENT).map((slug) => ({ slug }));
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const catalog = await getCatalog().catch(() => []);
  const product = catalog.find((entry) => entry.slug === slug);
  const content = getProductContent(slug);

  // A share card is not worth failing a build over. With no catalogue —
  // an unreachable database during a build — this still produces a valid
  // branded image rather than an exception.
  const name = product?.name ?? "Ekmool";
  const origin = product
    ? `${product.giTagName} · ${product.originState}`
    : "Single origin · India";
  const tagline = content?.tagline ?? "GI-tagged single-origin Indian foods";
  const from = product
    ? `From ${formatPaise(Math.min(...product.variants.map((v) => v.pricePaise)))}`
    : "";

  const GREEN_950 = "#10241B";
  const GOLD_500 = "#D99A2B";
  const CREAM = "#F5EFE2";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: GREEN_950,
          padding: "72px 80px",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 26,
              letterSpacing: "0.22em",
              color: CREAM,
            }}
          >
            EKMOOL
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 16,
              letterSpacing: "0.24em",
              color: GOLD_500,
            }}
          >
            SINGLE ORIGIN · INDIA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 74,
              lineHeight: 1.05,
              color: CREAM,
              maxWidth: 900,
            }}
          >
            {name}
          </div>
          <div
            style={{
              marginTop: 26,
              fontSize: 30,
              lineHeight: 1.35,
              color: "rgba(245,239,226,0.78)",
              maxWidth: 880,
            }}
          >
            {tagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `3px solid ${GOLD_500}`,
            paddingTop: 26,
          }}
        >
          <div style={{ fontSize: 24, color: GOLD_500 }}>{origin}</div>
          <div style={{ fontSize: 24, color: CREAM }}>{from}</div>
        </div>
      </div>
    ),
    size,
  );
}
