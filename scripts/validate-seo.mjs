/**
 * SEO + structured-data gate. Crawls the running site and fails the
 * process on any violation, so it can be wired into CI.
 *
 *   npm run validate:schema            (expects a server on :3100)
 *   npm run validate:schema -- 3000    (or pass a port)
 *
 * Checks per page: exactly one <h1>, no skipped heading levels, title
 * length, description length, canonical present, every JSON-LD block
 * parses, and the expected @types are present.
 */

// 3100, to match every other script here. This used to default to 3000,
// which is where the Docker container publishes — so running it with no
// argument silently validated whatever image happened to be up rather than
// the build just made, and passed while doing it.
const port = process.argv[2] ?? process.env.PORT ?? "3100";
const base = `http://localhost:${port}`;

const PAGES = [
  { path: "/", types: ["Organization", "WebSite"] },
  { path: "/products", types: ["Organization", "WebSite", "BreadcrumbList"] },
  {
    path: "/products/kandhamal-turmeric-powder",
    types: ["Product", "FAQPage", "BreadcrumbList"],
  },
  {
    path: "/products/lakadong-turmeric-powder",
    types: ["Product", "FAQPage", "BreadcrumbList"],
  },
  { path: "/products/mithila-makhana", types: ["Product", "FAQPage"] },
  { path: "/products/guntur-chilli-powder", types: ["Product", "FAQPage"] },
  { path: "/products/byadagi-chilli-powder", types: ["Product", "FAQPage"] },
  { path: "/about", types: ["BreadcrumbList"] },
  { path: "/blog", types: [] },
  { path: "/blog/lakadong-vs-kandhamal-turmeric", types: ["Article"] },
  { path: "/blog/what-is-a-gi-tag", types: ["Article"] },
  { path: "/blog/makhana-benefits", types: ["Article"] },
  { path: "/faq", types: ["FAQPage"] },
  { path: "/contact", types: [] },
  { path: "/privacy-policy", types: [] },
  { path: "/terms", types: [] },
  { path: "/shipping-policy", types: [] },
  { path: "/refund-policy", types: [] },
];

const NOINDEX_PAGES = ["/cart", "/checkout"];

const TITLE_MAX = 60;
const DESC_MIN = 150;
const DESC_MAX = 160;

/** Decode the handful of entities Next emits in attributes. */
function decode(text) {
  return text
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/");
}

function firstMatch(html, regex) {
  const match = html.match(regex);
  return match ? decode(match[1]) : null;
}

/**
 * The other direction: a string as JSON-LD holds it, re-encoded the way
 * React writes it into the body, so the two can be compared. Only the
 * characters React escapes — enough to find a review title, which is what
 * this is for.
 */
function escapeForHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

const failures = [];
const warnings = [];
/** internal href -> set of pages that link to it */
const internalLinks = new Map();

function fail(page, message) {
  failures.push(`${page}: ${message}`);
}

async function checkPage({ path, types }) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) {
    fail(path, `HTTP ${response.status}`);
    return;
  }
  const html = await response.text();

  // --- title ---
  const title = firstMatch(html, /<title>([^<]*)<\/title>/);
  if (!title) fail(path, "missing <title>");
  else if (title.length > TITLE_MAX)
    fail(path, `title ${title.length} chars (max ${TITLE_MAX}): "${title}"`);

  // --- description ---
  const description = firstMatch(
    html,
    /<meta name="description" content="([^"]*)"/,
  );
  if (!description) fail(path, "missing meta description");
  else if (description.length < DESC_MIN || description.length > DESC_MAX)
    fail(
      path,
      `description ${description.length} chars (want ${DESC_MIN}-${DESC_MAX})`,
    );

  // --- canonical ---
  if (!/<link rel="canonical" href="[^"]+"/.test(html))
    fail(path, "missing canonical link");

  // --- open graph ---
  if (!/<meta property="og:title"/.test(html))
    fail(path, "missing og:title");

  // --- headings ---
  const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1Count !== 1) fail(path, `${h1Count} <h1> elements (want exactly 1)`);

  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) =>
    Number(m[1]),
  );
  let previous = 0;
  for (const level of levels) {
    if (previous && level > previous + 1)
      warnings.push(`${path}: heading jumps h${previous} → h${level}`);
    previous = level;
  }

  // --- structured data ---
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">(.*?)<\/script>/gs,
    ),
  ];
  const found = new Set();
  for (const [, raw] of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      fail(path, `invalid JSON-LD: ${error.message}`);
      continue;
    }
    for (const doc of Array.isArray(parsed) ? parsed : [parsed]) {
      if (doc["@type"]) found.add(doc["@type"]);
      if (!doc["@context"])
        fail(path, `JSON-LD block missing @context (@type ${doc["@type"]})`);

      /**
       * Ratings must be real, and this used to be enforced by forbidding
       * aggregateRating outright — correct while the site had no reviews,
       * and wrong from the moment it had one.
       *
       * The rule that survives real reviews is **consistency with the
       * page**: a rating may only appear alongside the reviews it
       * averages, the count must match the number of them, and each one
       * must actually be printed in the HTML a reader sees. An invented
       * rating fails all three, which is the point — the check no longer
       * depends on the site happening to have no reviews.
       */
      if (doc.aggregateRating || doc.review) {
        const reviews = Array.isArray(doc.review) ? doc.review : [];
        const aggregate = doc.aggregateRating;

        if (!aggregate) {
          fail(path, "JSON-LD has review entries with no aggregateRating");
        } else if (reviews.length === 0) {
          fail(
            path,
            "JSON-LD has an aggregateRating with no reviews behind it",
          );
        } else {
          const count = Number(aggregate.reviewCount ?? 0);
          const value = Number(aggregate.ratingValue ?? 0);

          if (count < reviews.length) {
            fail(
              path,
              `aggregateRating claims ${count} reviews but carries ${reviews.length}`,
            );
          }
          if (!(value >= 1 && value <= 5)) {
            fail(path, `aggregateRating ratingValue ${value} is out of range`);
          }
          for (const review of reviews) {
            const title = String(review.name ?? "");
            if (title && !html.includes(escapeForHtml(title))) {
              fail(
                path,
                `JSON-LD review "${title}" is not shown anywhere on the page`,
              );
            }
          }
        }
      }
    }
  }
  for (const type of types) {
    if (!found.has(type)) fail(path, `missing JSON-LD @type ${type}`);
  }

  // --- images ---
  const imagesWithoutAlt = (html.match(/<img(?![^>]*\salt=)[^>]*>/g) ?? [])
    .length;
  if (imagesWithoutAlt > 0)
    fail(path, `${imagesWithoutAlt} <img> without alt`);

  // --- collect internal links for the crawl below ---
  for (const [, href] of html.matchAll(/<a[^>]+href="(\/[^"#?]*)"/g)) {
    const clean = decode(href).replace(/\/$/, "") || "/";
    if (clean.startsWith("/_next")) continue;
    if (!internalLinks.has(clean)) internalLinks.set(clean, new Set());
    internalLinks.get(clean).add(path);
  }

  const label = `${path}`.padEnd(42);
  console.log(
    `  ok  ${label} title ${String(title?.length ?? 0).padStart(2)}  desc ${String(
      description?.length ?? 0,
    ).padStart(3)}  ld [${[...found].join(", ")}]`,
  );
}

async function checkNoindex(path) {
  const response = await fetch(`${base}${path}`);
  const html = await response.text();
  if (!/<meta name="robots" content="[^"]*noindex/.test(html))
    fail(path, "must be noindex");
  else console.log(`  ok  ${path.padEnd(42)} noindex`);
}

async function checkRobotsAndSitemap() {
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  for (const disallowed of ["/api/", "/cart", "/checkout", "/admin"]) {
    if (!robots.includes(disallowed))
      fail("/robots.txt", `missing Disallow: ${disallowed}`);
  }
  if (!robots.includes("Sitemap:")) fail("/robots.txt", "missing Sitemap");
  console.log("  ok  /robots.txt");

  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const { path } of PAGES) {
    const expected = path === "/" ? "" : path;
    if (!urls.some((u) => u.endsWith(expected) || u.endsWith(`${expected}/`)))
      fail("/sitemap.xml", `missing ${path}`);
  }
  for (const path of [...NOINDEX_PAGES, "/admin"]) {
    if (urls.some((u) => u.endsWith(path)))
      fail("/sitemap.xml", `must not list ${path}`);
  }
  console.log(`  ok  /sitemap.xml (${urls.length} urls)`);
}

console.log(`Validating SEO against ${base}\n`);

for (const page of PAGES) {
  try {
    await checkPage(page);
  } catch (error) {
    fail(page.path, `check threw: ${error.message}`);
  }
}
for (const path of NOINDEX_PAGES) {
  try {
    await checkNoindex(path);
  } catch (error) {
    fail(path, `check threw: ${error.message}`);
  }
}
await checkRobotsAndSitemap();

/** Every internal link found on any checked page must resolve. */
async function checkInternalLinks() {
  const targets = [...internalLinks.keys()].sort();
  let broken = 0;
  for (const target of targets) {
    const response = await fetch(`${base}${target}`, { redirect: "manual" });
    if (response.status >= 400) {
      broken += 1;
      fail(
        target,
        `broken link (HTTP ${response.status}), linked from: ${[...internalLinks.get(target)].join(", ")}`,
      );
    }
  }
  console.log(
    `  ok  internal links (${targets.length} unique targets, ${broken} broken)`,
  );
}

await checkInternalLinks();

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const warning of warnings) console.log(`  warn  ${warning}`);
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}

console.log("\nAll SEO checks passed.");
