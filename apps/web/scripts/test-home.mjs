/**
 * The home page contract (M16).
 *
 *   npm run test:home            (expects a server on :3100)
 *   npm run test:home -- 3000    (or pass a port)
 *
 * The home page is the only route that is both the most-visited page on
 * the site and assembled from five different sources — the live
 * catalogue, the blog registry, the FAQ file, the shipping constants and
 * the reviews table. Each of those is a place it can quietly start lying.
 * This asserts the four properties that matter:
 *
 *   **Prices are the catalogue's.** Not a number typed into the page. A
 *   price shown here that the product page disagrees with is worse than
 *   no price at all.
 *
 *   **Shipping terms are the checkout's.** The free-delivery line is
 *   generated from FREE_SHIPPING_THRESHOLD_PAISE, so it cannot advertise
 *   a threshold the cart does not honour.
 *
 *   **Social proof is real or absent.** Section 3 drives the whole review
 *   lifecycle through the real functions — submitReview refuses anyone
 *   without a delivered order in their own name — and checks that a
 *   pending review stays invisible, a published one appears, and a
 *   withdrawn one leaves nothing behind. With none published the section
 *   must not render at all: no placeholder, no "coming soon", no empty
 *   stars.
 *
 *   **Structured data does not overreach.** ItemList yes; FAQPage no,
 *   because /faq owns that and two URLs claiming the same FAQ markup
 *   usually costs both of them the rich result. No AggregateRating on a
 *   page that averages nothing.
 *
 * Like scripts/test-admin.mjs, this imports the real query modules
 * through the `@/` hook in scripts/alias-loader.mjs rather than writing
 * its own SQL for the parts that must go through application code.
 */
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

loadEnv();

/**
 * submitReview and moderateReview are imported and called for real — the
 * eligibility rule they enforce is the property under test and reproducing
 * it in SQL here would test nothing.
 *
 * The cached getters (getCatalog, getRecentReviews) are deliberately *not*
 * called: unstable_cache throws "incrementalCache missing" outside a Next
 * request. Expected prices are read with plain SQL below, which is the
 * better arrangement anyway — the database is the oracle and the rendered
 * page is the thing being checked against it.
 */
const { submitReview, moderateReview } = await import("@/db/queries/reviews");
const { getPool } = await import("@/db/pool");
const { FREE_SHIPPING_THRESHOLD_PAISE, FLAT_SHIPPING_PAISE } = await import(
  "@/lib/constants"
);
const { formatPaise } = await import("@/lib/money");
const { BLOG_POSTS } = await import("@/lib/blog-registry");

const port = process.argv[2] ?? process.env.PORT ?? "3100";
const base = `http://localhost:${port}`;

const PROBE_EMAIL = "home-review-probe@example.test";
const PROBE_SLUG = "mithila-makhana";
const PROBE_TITLE = "Probe review title";
const PROBE_BODY = "Popped light and clean, and the pack was sealed properly.";

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

/**
 * Purge, then fetch until the rebuild lands.
 *
 * revalidateTag marks an entry stale rather than rebuilding it, so the
 * first response after a purge is still the previous copy. Same helper as
 * test-admin.mjs §7.
 */
async function fresh(path = "/") {
  await fetch(`${base}/api/revalidate`, {
    method: "POST",
    headers: { "x-revalidate-secret": process.env.REVALIDATE_SECRET ?? "" },
  }).catch(() => {});
  let html = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    html = await (await fetch(`${base}${path}`)).text();
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  // React separates adjacent text nodes with an empty comment, so JSX
  // written `from {formatPaise(n)}` arrives as `from <!-- -->₹189`. Strip
  // them, or every assertion has to know where React chose to split.
  return html.replaceAll("<!-- -->", "");
}

/** The escaping React applies on its way into the document body. */
function escapeForHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const reachable = await fetch(base)
  .then((r) => r.ok)
  .catch(() => false);
if (!reachable) {
  console.error(`No server on ${base}. Start one and retry.`);
  process.exit(1);
}

const db = await mysql.createConnection({
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  user: process.env.DATABASE_USER ?? "ekmool",
  password: process.env.DATABASE_PASSWORD ?? "ekmool_dev",
  database: process.env.DATABASE_NAME ?? "ekmool",
});

const orderId = `01PROBEHOME${Date.now().toString(36).toUpperCase()}`
  .padEnd(26, "0")
  .slice(0, 26);
let reviewId = null;

try {
  const [catalog] = await db.query(
    `SELECT p.slug, p.name, MIN(v.price_inr) AS cheapest
       FROM products p
       JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
      WHERE p.is_active = 1
      GROUP BY p.id, p.slug, p.name
      ORDER BY p.sort_order, p.id`,
  );
  const html = await fresh("/");

  /* ---------------------------------------------------------------- */
  console.log("\n1. The shelf is the catalogue, priced from it");

  check("there is a live catalogue to show", catalog.length > 0);
  for (const product of catalog) {
    const from = formatPaise(Number(product.cheapest));
    check(`${product.slug} — named`, html.includes(escapeForHtml(product.name)));
    check(
      `${product.slug} — priced from ${from}`,
      html.includes(escapeForHtml(`from ${from}`)),
      "the home page is showing a price the database does not agree with",
    );
    check(
      `${product.slug} — links to its own page`,
      html.includes(`/products/${product.slug}`),
    );
  }

  /* ---------------------------------------------------------------- */
  console.log("\n2. Delivery terms come from the constants checkout charges");

  check(
    `free-delivery threshold reads ${formatPaise(FREE_SHIPPING_THRESHOLD_PAISE)}`,
    html.includes(escapeForHtml(formatPaise(FREE_SHIPPING_THRESHOLD_PAISE))),
  );
  check(
    `flat rate reads ${formatPaise(FLAT_SHIPPING_PAISE)}`,
    html.includes(escapeForHtml(formatPaise(FLAT_SHIPPING_PAISE))),
  );
  check("Cash on Delivery is stated up front", /Cash on Delivery/.test(html));
  check("and the order-tracking route is offered", html.includes("/track"));

  /* ---------------------------------------------------------------- */
  console.log("\n3. Editorial sections read from their own registries");

  const newest = [...BLOG_POSTS]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 3);
  for (const post of newest) {
    check(
      `journal — "${post.title.slice(0, 32)}…"`,
      html.includes(escapeForHtml(post.title)),
    );
  }
  check(
    "six FAQ questions, taken from the FAQ file",
    (html.match(/<summary/g) ?? []).length === 6,
    `found ${(html.match(/<summary/g) ?? []).length}`,
  );
  check("with a route to the rest of them", html.includes('href="/faq"'));

  /* ---------------------------------------------------------------- */
  console.log("\n4. Structured data claims only what the page shows");

  check("ItemList is emitted", html.includes('"@type":"ItemList"'));
  check(
    "listing every product, once",
    (html.match(/"@type":"ListItem"/g) ?? []).length === catalog.length,
  );
  check(
    "no FAQPage — /faq owns that markup",
    !html.includes('"@type":"FAQPage"'),
  );
  check("no aggregateRating on a page that averages nothing", !html.includes("aggregateRating"));
  check("no Product markup either — the product pages own it", !html.includes('"@type":"Product"'));

  /* ---------------------------------------------------------------- */
  console.log("\n5. With nothing published, the review section is absent");

  const [existing] = await db.query(
    `SELECT COUNT(*) n FROM reviews WHERE status = 'published'`,
  );
  const startedEmpty = Number(existing[0].n) === 0;
  if (!startedEmpty) {
    console.log(
      `  note  ${existing[0].n} review(s) already published — skipping the empty-state check`,
    );
  } else {
    check("no review section at all", !html.includes("voices-heading"));
    check("and no placeholder standing in for one", !/In their kitchens/.test(html));
  }

  /* ---------------------------------------------------------------- */
  console.log("\n6. A real review, end to end");

  const [variantRows] = await db.query(
    `SELECT v.id, v.price_inr AS price_paise FROM product_variants v
       JOIN products p ON p.id = v.product_id
      WHERE p.slug = ? ORDER BY v.id LIMIT 1`,
    [PROBE_SLUG],
  );
  const variant = variantRows[0];

  await db.execute(
    `INSERT INTO orders (id, idempotency_key, customer_name, customer_email,
        customer_phone, address_line1, address_city, address_state,
        address_pincode, subtotal_paise, discount_paise, shipping_paise,
        total_paise, payment_method, payment_status, status, delivered_at)
     VALUES (?, ?, 'Probe Person', ?, '9000000000', '1 Test Road', 'Patna',
        'Bihar', '800001', ?, 0, 0, ?, 'cod', 'pending', 'delivered', NOW())`,
    [orderId, `probe-${orderId}`, PROBE_EMAIL, variant.price_paise, variant.price_paise],
  );
  await db.execute(
    `INSERT INTO order_items (order_id, variant_id, sku, product_slug,
        product_name, pack_size_label, unit_price_paise, qty, line_total_paise,
        discount_paise, gst_rate_bps, taxable_value_paise, cgst_paise,
        sgst_paise, igst_paise)
     VALUES (?, ?, 'PROBE-SKU', ?, 'Mithila Makhana (Fox Nuts)', '250 g',
        ?, 1, ?, 0, 0, ?, 0, 0, 0)`,
    [orderId, variant.id, PROBE_SLUG, variant.price_paise, variant.price_paise, variant.price_paise],
  );

  const outcome = await submitReview({
    email: PROBE_EMAIL,
    productSlug: PROBE_SLUG,
    rating: 5,
    title: PROBE_TITLE,
    body: PROBE_BODY,
  });
  check("submitReview accepts a delivered buyer", outcome === "submitted", outcome);

  const [pending] = await db.query(
    `SELECT id FROM reviews WHERE customer_email = ?`,
    [PROBE_EMAIL],
  );
  reviewId = pending[0]?.id ?? null;
  check("the row exists, unpublished", reviewId !== null);

  const whilePending = await fresh("/");
  check(
    "an unmoderated review never reaches the home page",
    !whilePending.includes(PROBE_TITLE),
  );

  await moderateReview(reviewId, "published", null);

  const published = await fresh("/");
  check("the section appears once published", published.includes("voices-heading"));
  check("carrying the review's own title", published.includes(escapeForHtml(PROBE_TITLE)));
  check("its body", published.includes(escapeForHtml(PROBE_BODY)));
  check("a verified-buyer byline", published.includes("Verified buyer"));
  check(
    "and the product's name, joined on so an archived one drops out",
    published.includes(escapeForHtml("Mithila Makhana (Fox Nuts)")),
  );
  check(
    "and a link to the product it is about",
    published.includes(`/products/${PROBE_SLUG}`),
  );
  check(
    "still no aggregateRating — the average belongs on the product page",
    !published.includes("aggregateRating"),
  );

  await moderateReview(reviewId, "rejected", "probe cleanup");
  const withdrawn = await fresh("/");
  check("withdrawing it removes the section", !withdrawn.includes("voices-heading"));
  check("leaving no orphan quote", !withdrawn.includes(escapeForHtml(PROBE_TITLE)));
} finally {
  if (reviewId) await db.execute(`DELETE FROM reviews WHERE id = ?`, [reviewId]);
  await db.execute(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);
  await db.execute(`DELETE FROM order_status_history WHERE order_id = ?`, [orderId]);
  await db.execute(`DELETE FROM orders WHERE id = ?`, [orderId]);
  await db.execute(`DELETE FROM customers WHERE email = ?`, [PROBE_EMAIL]);
  console.log("\n  cleanup  probe order, customer and review removed");
  await db.end();
  // The query modules opened the app's own pool on globalThis. Closing only
  // this script's connection would leave the process hanging — the same
  // trap test-admin.mjs hit in M14.
  await getPool().end();
  await fresh("/");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
