/**
 * Discovery: search, filters, wishlist, PIN codes, back-in-stock (M12).
 *
 *   node scripts/test-discovery.mjs [port]
 *
 * Two things here are worth more than the rest.
 *
 * **Search is asserted on ranking, not just on hits.** Every scoring bug
 * this feature has had returned the right product somewhere in a list of
 * five — "guntur" matched all five because pack labels tokenise to
 * ["100", "g"] and every product therefore owned a one-character token.
 * A test that only asked "did Guntur appear" passed throughout. So the
 * checks below pin the *first* result and the *count*.
 *
 * **The PIN code checker is asserted against the published policy.** The
 * bands come from one table that /shipping-policy also renders, and the
 * point of the test is that the two cannot drift apart without something
 * going red.
 */
import mysql from "mysql2/promise";
import { loadEnv } from "./load-env.mts";

loadEnv();

const port = process.argv[2] ?? "3100";
const base = `http://localhost:${port}`;

const TEST_EMAIL = "discovery-test@example.com";
const OTHER_EMAIL = "discovery-other@example.com";

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

function db() {
  return mysql.createConnection({
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    user: process.env.DATABASE_USER ?? "ekmool",
    password: process.env.DATABASE_PASSWORD ?? "",
    database: process.env.DATABASE_NAME ?? "ekmool",
  });
}

/**
 * React's SSR splits adjacent expressions with `<!-- -->` markers, so
 * `{a} to {b} working days` reaches the wire as
 * `2<!-- --> to <!-- -->4<!-- --> working days`. Any assertion about
 * rendered prose has to strip them or it is testing React's hydration
 * format rather than the copy.
 */
function text(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/** Product names as rendered on a card, in result order. */
async function search(query) {
  const response = await fetch(
    `${base}/search?q=${encodeURIComponent(query)}`,
  );
  const html = await response.text();
  return {
    status: response.status,
    html,
    empty: html.includes("Nothing matched"),
    names: [...html.matchAll(/group-hover:text-ek-gold-800">([^<]+)</g)].map(
      (match) => match[1],
    ),
  };
}

console.log(`Discovery tests against ${base}\n`);

/* ------------------------------------------------------------------ */
console.log("1. Search finds things by the name people actually use");

{
  const haldi = await search("haldi");
  check("the page renders", haldi.status === 200);
  check(
    "'haldi' returns both turmerics and nothing else",
    haldi.names.length === 2 && haldi.names.every((n) => n.includes("Turmeric")),
    haldi.names.join(", "),
  );

  const mirchi = await search("mirchi");
  check(
    "'mirchi' returns both chillies and nothing else",
    mirchi.names.length === 2 && mirchi.names.every((n) => n.includes("Chilli")),
    mirchi.names.join(", "),
  );

  const foxNut = await search("fox nut");
  check(
    "'fox nut' — two words, meaningless apart — finds makhana",
    foxNut.names.length === 1 && foxNut.names[0].includes("Makhana"),
    foxNut.names.join(", "),
  );

  const typo = await search("turmaric");
  check(
    "a common misspelling still finds turmeric",
    typo.names.length === 2 && typo.names.every((n) => n.includes("Turmeric")),
    typo.names.join(", "),
  );

  const byadgi = await search("byadgi");
  check(
    "'byadgi' puts Byadagi first, not third",
    byadgi.names[0]?.includes("Byadagi"),
    byadgi.names.join(", "),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n2. Search ranks, and refuses to match noise");

{
  const district = await search("guntur");
  check(
    "one district does not return the whole catalogue",
    district.names.length < 5,
    `${district.names.length} results: ${district.names.join(", ")}`,
  );
  check(
    "and the district asked for is first",
    district.names[0]?.includes("Guntur"),
    district.names.join(", "),
  );

  const both = await search("lakadong turmeric");
  check(
    "two matching terms outrank one",
    both.names[0]?.includes("Lakadong"),
    both.names.join(", "),
  );

  const nonsense = await search("shoes");
  check("a word we do not sell returns nothing", nonsense.empty);
  check(
    "and the empty state still offers the shelf",
    nonsense.html.includes("What we do have"),
  );

  const nearMiss = await search("makhanna");
  check(
    "a near miss is offered a correction",
    nearMiss.html.includes("Did you mean"),
  );

  const partial = await search("turmer");
  check(
    "a half-typed word still finds its products",
    partial.names.length === 2,
    partial.names.join(", "),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n3. Search results are not indexable, and cost no query");

{
  const response = await fetch(`${base}/search?q=haldi`);
  const html = await response.text();
  check(
    "result pages are noindex",
    /<meta name="robots" content="[^"]*noindex/.test(html),
  );
  check(
    "but links are still followed, so products keep the authority",
    /<meta name="robots" content="[^"]*follow/.test(html) &&
      !/nofollow/.test(html),
  );

  // A repeated parameter must not be joined into a query nobody typed.
  const repeated = await fetch(`${base}/search?q=haldi&q=mirchi`);
  const repeatedHtml = text(await repeated.text());
  check(
    "a repeated ?q= takes the first, not a merge of both",
    repeatedHtml.includes("Results for “haldi”"),
  );

  const oversized = await fetch(`${base}/search?q=${"x".repeat(500)}`);
  check("an oversized query is truncated, not an error", oversized.status === 200);
}

/* ------------------------------------------------------------------ */
console.log("\n4. /products stays static, and ships every product without JS");

{
  const response = await fetch(`${base}/products`);
  const html = await response.text();
  const cards = [...html.matchAll(/href="\/products\/[a-z-]+"/g)].length;

  check("the catalogue renders", response.status === 200);
  check(
    "all five products are in the prerendered HTML",
    ["kandhamal", "lakadong", "mithila", "guntur", "byadagi"].every((slug) =>
      html.includes(`/products/${slug}`),
    ),
    `${cards} product links`,
  );
  // The filter bar reads useSearchParams, so it lives behind a Suspense
  // boundary and is not in the prerendered HTML. That is the intended
  // trade: what a crawler and a JS-less browser get is the whole shelf,
  // unfiltered, which is exactly what /products means with nothing chosen.
  check(
    "the filter bar is not in the static HTML, so the page stays cacheable",
    !html.includes("Clear filters"),
  );

  // Filtering is client-side by design, so a query string must not change
  // what the server sends — that is what keeps the page in the static cache.
  const filtered = await fetch(`${base}/products?family=turmeric`);
  const filteredHtml = await filtered.text();
  check(
    "a filter in the URL does not make the server render a different page",
    filteredHtml.includes("/products/mithila-makhana"),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n5. PIN codes: the estimate matches the published policy");

{
  const ask = async (pincode) =>
    (await fetch(`${base}/api/serviceability?pincode=${pincode}`)).json();

  const metro = await ask("560001");
  check(
    "a metro PIN code resolves to its circle",
    metro.code === "OK" && metro.circle === "Karnataka",
    JSON.stringify(metro.circle),
  );
  check(
    "metro transit is the policy's 2-4 days plus one to dispatch",
    metro.minDays === 3 && metro.maxDays === 5,
    `${metro.minDays}-${metro.maxDays}`,
  );

  const northEast = await ask("793109");
  check(
    "the North East gets the extended band, not the default",
    northEast.zone?.id === "extended" &&
      northEast.minDays === 7 &&
      northEast.maxDays === 11,
    `${northEast.zone?.id} ${northEast.minDays}-${northEast.maxDays}`,
  );

  const islands = await ask("744101");
  check(
    "the Andamans are named as themselves, not as West Bengal",
    islands.circle === "Andaman & Nicobar Islands",
    JSON.stringify(islands.circle),
  );

  const lakshadweep = await ask("682555");
  check(
    "Lakshadweep is separated from the Kerala prefix it sits inside",
    lakshadweep.circle === "Lakshadweep",
    JSON.stringify(lakshadweep.circle),
  );

  const hill = await ask("249001");
  check(
    "a prefix covering both plains and hills quotes the slower band",
    hill.zone?.id === "extended",
    hill.zone?.id,
  );

  const army = await ask("900001");
  check(
    "an Army Postal address is told the truth, not refused",
    army.code === "ARMY_POSTAL" && army.message.includes("India Post"),
  );

  const zero = await ask("012345");
  check("a PIN code starting 0 is called a typo", zero.code === "UNASSIGNED");

  const short = await fetch(`${base}/api/serviceability?pincode=1234`);
  check("a five-digit number is a 400", short.status === 400);

  const letters = await ask("56OOO1");
  check("letters are refused", letters.code === "INVALID_FORMAT");

  const cached = await fetch(`${base}/api/serviceability?pincode=110001`);
  check(
    "a successful lookup is cacheable, so a CDN can answer the next one",
    (cached.headers.get("cache-control") ?? "").includes("max-age=86400"),
    cached.headers.get("cache-control") ?? "",
  );

  // The policy page and the checker read one table. If someone edits the
  // prose without the table, this is what catches it.
  const policy = text(await (await fetch(`${base}/shipping-policy`)).text());
  check(
    "the shipping policy quotes the same bands as the checker",
    policy.includes("2 to 4 working days") &&
      policy.includes("4 to 7 working days") &&
      policy.includes("6 to 10 working days"),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n6. A product page carries the rest of the shelf");

{
  const html = text(
    await (await fetch(`${base}/products/guntur-chilli-powder`)).text(),
  );

  check("the product page renders", html.includes("Guntur"));
  check(
    "related products are server-rendered, costing no client JavaScript",
    html.includes("The rest of the shelf"),
  );

  const shelf = html.slice(html.indexOf("The rest of the shelf"));
  const suggested = [
    ...shelf.matchAll(/group-hover:text-ek-gold-800">([^<]+)</g),
  ].map((match) => match[1]);

  check(
    "the same food from a different district is offered first",
    suggested[0]?.includes("Byadagi"),
    suggested.join(", "),
  );
  check(
    "and the least related product is dropped rather than padded in",
    suggested.length === 3 && !suggested.some((n) => n.includes("Makhana")),
    suggested.join(", "),
  );
  check(
    "each suggestion states why it is there",
    html.includes("grown in") || html.includes("same pot"),
  );
  check(
    "and none of it claims other customers bought anything",
    !/also (bought|liked|viewed)/i.test(html),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n7. The wishlist belongs to the session, or to nobody");

let sessionCookie = null;

{
  const guest = await fetch(`${base}/api/account/wishlist`);
  check("a guest gets no server list", guest.status === 401, `got ${guest.status}`);

  const guestWrite = await fetch(`${base}/api/account/wishlist`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slugs: ["mithila-makhana"] }),
  });
  check(
    "and cannot write one either",
    guestWrite.status === 401,
    `got ${guestWrite.status}`,
  );

  // An order is the only way to a session, which is the whole design.
  const connection = await db();
  const [variants] = await connection.execute(
    "SELECT id FROM product_variants ORDER BY id LIMIT 1",
  );
  await connection.end();

  const checkout = await fetch(`${base}/api/checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `discovery-${Date.now()}`,
    },
    body: JSON.stringify({
      customer: { name: "Discovery Tester", email: TEST_EMAIL, phone: "9876543210" },
      address: {
        line1: "12 Residency Road",
        line2: "",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560025",
        landmark: "",
      },
      paymentMethod: "cod",
      items: [{ variantId: variants[0].id, qty: 1 }],
      notes: "",
    }),
  });
  const order = await checkout.json();
  check("an order can be placed to get a session", checkout.status === 201);

  const lookup = await fetch(`${base}/api/account/lookup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reference: String(order.orderId).slice(-8),
      email: TEST_EMAIL,
    }),
  });
  sessionCookie = (lookup.headers.get("set-cookie") ?? "").split(";")[0];
  check("and looked up to hold one", lookup.status === 200 && sessionCookie.length > 0);
}

if (sessionCookie) {
  const withSession = (method, body) =>
    fetch(`${base}/api/account/wishlist`, {
      method,
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify(body),
    });

  const merged = await (
    await withSession("POST", { slugs: ["mithila-makhana", "guntur-chilli-powder"] })
  ).json();
  check(
    "the browser's list is merged in on arrival",
    merged.slugs.length === 2,
    JSON.stringify(merged.slugs),
  );

  const secondDevice = await (
    await withSession("POST", { slugs: ["lakadong-turmeric-powder"] })
  ).json();
  check(
    "a second device adds to the list rather than replacing it",
    secondDevice.slugs.length === 3,
    JSON.stringify(secondDevice.slugs),
  );

  const replaced = await (
    await withSession("PUT", { slugs: ["lakadong-turmeric-powder"] })
  ).json();
  check(
    "but a removal made on the page replaces, so it sticks",
    replaced.slugs.length === 1 && replaced.slugs[0] === "lakadong-turmeric-powder",
    JSON.stringify(replaced.slugs),
  );

  const junk = await withSession("POST", { slugs: ["../../etc/passwd"] });
  check("a slug that is not a slug is refused", junk.status === 422);

  const flood = await withSession("POST", {
    slugs: Array.from({ length: 200 }, (_, i) => `x${i}`),
  });
  check(
    "and a poisoned localStorage cannot turn one request into 200 rows",
    flood.status === 422,
    `got ${flood.status}`,
  );

  // The list is keyed to the session's email, never to anything in the body.
  const connection = await db();
  const [rows] = await connection.execute(
    `SELECT COUNT(*) n FROM wishlist_items w
       JOIN customers c ON c.id = w.customer_id
      WHERE c.email = ?`,
    [OTHER_EMAIL],
  );
  await connection.end();
  check(
    "no other customer's list was touched",
    Number(rows[0].n) === 0,
    `${rows[0].n} rows`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n8. Back-in-stock takes an address once, for one pack");

let outOfStockVariant = null;
let restoreQty = 0;

{
  const connection = await db();
  const [variants] = await connection.execute(
    "SELECT id, stock_qty FROM product_variants ORDER BY id DESC LIMIT 1",
  );
  outOfStockVariant = variants[0].id;
  restoreQty = variants[0].stock_qty;
  await connection.execute(
    "UPDATE product_variants SET stock_qty = 0 WHERE id = ?",
    [outOfStockVariant],
  );
  await connection.end();

  const ask = (body) =>
    fetch(`${base}/api/back-in-stock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const first = await ask({ variantId: outOfStockVariant, email: TEST_EMAIL });
  const firstBody = await first.json();
  check(
    "a request against a sold-out pack is accepted",
    first.status === 200 && firstBody.code === "REGISTERED",
    `${first.status} ${firstBody.code}`,
  );

  const again = await ask({ variantId: outOfStockVariant, email: TEST_EMAIL });
  check(
    "asking twice does not queue two emails",
    (await again.json()).code === "ALREADY_WAITING",
  );

  const connection2 = await db();
  const [rows] = await connection2.execute(
    "SELECT request_count FROM back_in_stock_requests WHERE variant_id = ? AND email = ?",
    [outOfStockVariant, TEST_EMAIL],
  );
  const [all] = await connection2.execute(
    "SELECT COUNT(*) n FROM back_in_stock_requests WHERE variant_id = ? AND email = ?",
    [outOfStockVariant, TEST_EMAIL],
  );
  await connection2.end();
  check("it stays one row", Number(all[0].n) === 1, `${all[0].n} rows`);
  check(
    "with the second ask recorded as demand, not as a second person",
    Number(rows[0].request_count) === 2,
    `count ${rows[0].request_count}`,
  );

  const badEmail = await ask({ variantId: outOfStockVariant, email: "not-an-email" });
  check("a malformed address is refused", badEmail.status === 422);

  const unknown = await ask({ variantId: 999999, email: TEST_EMAIL });
  check(
    "interest in a pack we do not sell is refused",
    unknown.status === 404,
    `got ${unknown.status}`,
  );

  const trapped = await ask({
    variantId: outOfStockVariant,
    email: OTHER_EMAIL,
    company_website: "https://spam.example",
  });
  check("a filled honeypot is refused", trapped.status === 400);

  const connection3 = await db();
  const [trappedRows] = await connection3.execute(
    "SELECT COUNT(*) n FROM back_in_stock_requests WHERE email = ?",
    [OTHER_EMAIL],
  );
  await connection3.end();
  check(
    "and nothing was written for it",
    Number(trappedRows[0].n) === 0,
    `${trappedRows[0].n} rows`,
  );

  // The product page is served from an hourly cache, so a form can be
  // submitted from a page rendered before a restock and arrive after it.
  // The server has to be the one that decides, because the page's copy of
  // the stock figure may be an hour old.
  const connection4 = await db();
  const [inStock] = await connection4.execute(
    "SELECT id FROM product_variants WHERE stock_qty > 0 ORDER BY id LIMIT 1",
  );
  await connection4.end();

  const available = await ask({
    variantId: inStock[0].id,
    email: TEST_EMAIL,
  });
  const availableBody = await available.json();
  check(
    "interest in a pack that is actually on the shelf is refused",
    available.status === 409 && availableBody.code === "IN_STOCK",
    `${available.status} ${availableBody.code}`,
  );

  const connection5 = await db();
  const [stray] = await connection5.execute(
    "SELECT COUNT(*) n FROM back_in_stock_requests WHERE variant_id = ?",
    [inStock[0].id],
  );
  await connection5.end();
  check(
    "and no row is left waiting for a restock that already happened",
    Number(stray[0].n) === 0,
    `${stray[0].n} rows`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n9. The new data answers a privacy request");

if (sessionCookie) {
  const exported = await (
    await fetch(`${base}/api/account/export`, { headers: { cookie: sessionCookie } })
  ).json();

  check(
    "saved items appear in a data export",
    Array.isArray(exported.savedItems),
    typeof exported.savedItems,
  );
  check(
    "so do back-in-stock requests, which no order would reveal",
    Array.isArray(exported.backInStockRequests) &&
      exported.backInStockRequests.length === 1,
    JSON.stringify(exported.backInStockRequests?.length),
  );

  const erased = await (
    await fetch(`${base}/api/account/erase`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ confirm: "ERASE" }),
    })
  ).json();

  check("erasure reports what it removed", erased.ok === true);
  check(
    "including the saved items",
    typeof erased.savedItemsDeleted === "number",
  );
  check(
    "and the back-in-stock request, which is deleted outright",
    erased.backInStockDeleted === 1,
    String(erased.backInStockDeleted),
  );

  const connection = await db();
  const [left] = await connection.execute(
    "SELECT COUNT(*) n FROM back_in_stock_requests WHERE email = ?",
    [TEST_EMAIL],
  );
  const [saved] = await connection.execute(
    `SELECT COUNT(*) n FROM wishlist_items w JOIN customers c ON c.id = w.customer_id
      WHERE c.email = ?`,
    [TEST_EMAIL],
  );
  await connection.end();
  check("nothing is left behind in the queue", Number(left[0].n) === 0);
  check("nor in the wishlist", Number(saved[0].n) === 0);

  // The cookie outlives the customer row it named. This used to answer 200
  // with an empty list, which the page reads as "the merge ran" — so it
  // replaced the browser's list with nothing and destroyed every item saved
  // since the erasure. A session with no account behind it has to answer
  // exactly as a guest does.
  const orphaned = await fetch(`${base}/api/account/wishlist`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ slugs: ["mithila-makhana"] }),
  });
  check(
    "a session outliving its customer is treated as no session, not as an empty list",
    orphaned.status === 401,
    `got ${orphaned.status} ${JSON.stringify(await orphaned.text()).slice(0, 60)}`,
  );
}

/* ---------- cleanup ---------- */
{
  const connection = await db();

  if (outOfStockVariant !== null) {
    await connection.execute(
      "UPDATE product_variants SET stock_qty = ? WHERE id = ?",
      [restoreQty, outOfStockVariant],
    );
    await connection.execute(
      "DELETE FROM back_in_stock_requests WHERE email IN (?, ?)",
      [TEST_EMAIL, OTHER_EMAIL],
    );
  }

  // The order placed above took a unit; erasure anonymised the row but the
  // stock is still spent, so put it back and drop the record.
  const [held] = await connection.execute(
    `SELECT i.variant_id v, i.qty q
       FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE (o.customer_email = ? OR o.customer_email LIKE 'erased+%')
        AND o.status <> 'cancelled' AND i.variant_id IS NOT NULL`,
    [TEST_EMAIL],
  );
  for (const row of held) {
    await connection.execute(
      "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
      [row.q, row.v],
    );
  }
  await connection.execute(
    `DELETE l FROM email_log l JOIN orders o ON o.id = l.order_id
      WHERE o.customer_email = ? OR o.customer_email LIKE 'erased+%'`,
    [TEST_EMAIL],
  );
  await connection.execute(
    "DELETE FROM orders WHERE customer_email = ? OR customer_email LIKE 'erased+%'",
    [TEST_EMAIL],
  );
  await connection.execute("DELETE FROM customers WHERE email IN (?, ?)", [
    TEST_EMAIL,
    OTHER_EMAIL,
  ]);
  await connection.end();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`  ${failure}`);
}

process.exit(failures.length ? 1 : 0);
