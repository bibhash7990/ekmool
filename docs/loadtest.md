# Load and failure testing — M7

Measured 2026-08-04 against the **standalone production bundle**
(`npm run build && npm run standalone && npm run standalone:start`), the same
artifact a VPS deploy runs. k6 v2.1.0, MySQL 8.4 in Docker.

Hardware: one Windows laptop, 12 logical cores. **The load generator runs on
the same machine as the server it is measuring**, so absolute latencies
describe this laptop under a co-located load generator, not production. What
the numbers are good for is the shape of the curve, the error rates, and the
database invariants — all of which are hardware-independent.

```bash
npm run loadtest
```

```bash
npm run chaos
```

Reports land in `research/loadtest/`.

---

## 1. Browsing — "survives 10,000 concurrent users"

### The arithmetic

10,000 concurrent *browsing users* is not 10,000 simultaneous requests. A
person reading a product page spends ten to thirty seconds on it. At a 20 s
think time:

    10,000 users / 20 s = 500 requests per second

So 500 rps of public page traffic is the number the origin has to sustain,
and it is what `scripts/k6/browse-10k.js` drives by default.

### Results — one origin process

Weighted traffic across home, catalogue, all five product pages, two blog
posts, about and FAQ. Requests send `Accept-Encoding: gzip`, as every real
browser does — this matters more than it sounds: a product page is **82 KB
raw and 14.8 KB gzipped**, so omitting the header would have measured the
server shipping 5.5× the bytes it will ever actually ship.

| rps | p50 | p95 | p99 | max | failed | server CPU |
|---:|---:|---:|---:|---:|---:|---|
| 150 | 3.1 ms | 4.0 ms | 4.6 ms | 10.9 ms | 0.000% | 54% of one core |
| 250 | 2.7 ms | 3.7 ms | 6.9 ms | 20.1 ms | 0.000% | 83% |
| 350 | 2.7 ms | 5.7 ms | 14.8 ms | 33.5 ms | 0.000% | 106% |
| 400 | 3.4 ms | 9.0 ms | 25.4 ms | 63.4 ms | 0.000% | 124% |
| 450 | 3.7 ms | 21.3 ms | 56.7 ms | 92.0 ms | 0.000% | 137% |
| 500 | 10.6 ms | 543 ms | 769 ms | 1169 ms | 0.000% | 162% |

A 60-second run at 500 rps: **29,971 requests, 0.000% failed**.

**The knee is at ~450 rps for a single Node process.** Below it, p95 stays
under 25 ms. At 500 rps latency degrades by an order of magnitude while
throughput and error rate hold — the queue grows, but nothing breaks and no
user sees an error.

Where exactly the knee falls depends on what else the machine is doing. The
table above was measured on an otherwise-idle laptop. Repeating it later with
a browser open, the same server could not sustain 500 rps at all (478 rps
actual, p95 1259 ms) while 400 rps stayed clean at p95 67 ms. **The error rate
was 0.000% in every one of those runs** — saturation here shows up as latency,
never as failure. That is why `npm run loadtest` gates the browse phase at
400 rps: it is inside the knee on a working machine, so the suite stays
trustworthy. 500 rps is a measurement, not a gate.

The bottleneck is CPU, not sockets. k6 reports `http_req_connecting` at 0.0 ms
p95 and TIME_WAIT stayed at 9 sockets, so this is not port exhaustion; the
entire tail is TTFB. Above one core of CPU the work is gzip, which Node does
on the libuv threadpool — hence >100% of a core.

So one origin process ≈ **9,000 concurrent browsing users**. The full 10,000
needs a second process, which is one line of PM2 config — or, in the deploy
this project actually documents, a CDN that answers these paths so the origin
never sees them at all.

### Two origin processes

Two standalone servers, 400 rps each:

| origin | rps | p50 | p95 | failed |
|---|---:|---:|---:|---:|
| A (:3100) | 400 | 5.1 ms | 168 ms | 0.000% |
| B (:3101) | 400 | 6.4 ms | 282 ms | 0.000% |

**800 rps aggregate, zero errors.** Latency is worse than a single process at
400 rps because the laptop is now running two servers *and* two load
generators across 12 cores — this understates dedicated hardware. It is
enough to show that throughput scales by adding processes and that nothing
degrades except latency.

A cold process is markedly slower: origin B's first run, before its page cache
was warm, sat at p95 1957 ms and could not hold 400 rps. Worth knowing before
you interpret the first minute after a deploy.

### The claim that actually matters

A 60-second browse run at 500 rps — roughly 30,000 page views — issued
**~11 MySQL queries in total**, and that count includes the two
`SHOW GLOBAL STATUS` statements the test harness itself ran.

Browsing does not touch the database. Every public page is prerendered at
build time or served from the ISR cache; `unstable_cache` with a one-hour
window means the catalogue query runs about once an hour, not once a request.

---

## 2. Checkout under load — oversell

50 orders/second for 30 seconds: **1,501 requests**, each a distinct buyer
with a distinct `Idempotency-Key` and a distinct `X-Forwarded-For` (50 real
orders a second come from ~50 people, not one client, and the per-IP limiter
should be exercised that way rather than throttling the test).

Demand deliberately exceeds supply, so the run drains variants and starts
refusing:

| outcome | count |
|---|---:|
| 201 created | 1,357 |
| 409 sold out | 144 |
| 429 rate limited | 0 |
| 5xx | 0 |

p95 latency 50 ms.

Verified in SQL afterwards:

- **No variant went negative.**
- **Units sold == starting stock − ending stock, per variant, exactly.** This
  is the oversell test. A read-then-write would let concurrent iterations
  interleave and sell the same unit twice; the atomic
  `UPDATE ... SET stock_qty = stock_qty - ? WHERE id = ? AND stock_qty >= ?`
  does not.
- **No idempotency key produced two orders.**

409 is a correct answer here, not a failure — the pass condition is that the
books balance.

---

## 3. Webhook storm — double-charge protection

500 deliveries of the *same* `payment.captured` event, fired 50-wide, completing
in 4.5 s. Razorpay retries on timeout and can deliver the same event more than
once, sometimes overlapping.

| result | count |
|---|---:|
| `transitioned: true` | **1** |
| no-op 200 replays | 499 |
| non-200 | 0 |

And in the database: **one** `order_status_history` row written by the webhook,
**one** `email_log` row. A bad signature is rejected with 400.

Two independent mechanisms hold this: the `payment_status <> 'paid'` guard
inside the transaction, and the UNIQUE index on `orders.razorpay_payment_id`
that catches whichever delivery loses the race.

This phase needs Razorpay configured, and `NEXT_PUBLIC_RAZORPAY_KEY_ID` is
inlined at build time, so it needs its own build:

```bash
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_x RAZORPAY_KEY_SECRET=s RAZORPAY_WEBHOOK_SECRET=w npm run build
```

```bash
PHASES=webhook RAZORPAY_WEBHOOK_SECRET=w npm run loadtest
```

Without it the phase skips loudly rather than passing silently. Note that
these were throwaway strings — no Razorpay account was involved, because the
webhook path never calls Razorpay's API, it only verifies an HMAC we compute
ourselves.

---

## 4. The bug this whole exercise existed to find

Chasing a 404 in a Lighthouse run turned up a defect that would have taken the
storefront down in production, on an ordinary day, with nothing wrong.

**One call to `revalidateCatalog()` permanently 404'd every product page.**

`revalidateCatalog()` did `revalidatePath("/products/<slug>")` for all five
products. `/products/[slug]` sets `dynamicParams = false`, which compiles to
`fallback: false` in the prerender manifest. For such a route `revalidatePath`
does not mark the path stale — it removes the prerendered entry, and with no
fallback Next has nothing left to serve or regenerate from. The route answers
`NoFallbackError`, which surfaces as **404**.

It does not recover. Not on retry, not when the database is healthy, not on
restart — the state lives in `.next`. Only a rebuild brings the pages back.

What makes it severe is who calls it. `revalidateCatalog()` runs from
`/api/revalidate` **and from the admin stock editor**. So the first time the
shop owner corrected a stock count, all five product pages would have gone to
404 and stayed there — every product URL, including the ones in the sitemap
already submitted to Google.

Reproduced with the database perfectly healthy:

```
baseline                200  /products/lakadong-turmeric-powder
POST /api/revalidate → {"revalidated":true}
after                   200  /            200  /products
                        404  /products/lakadong-turmeric-powder
                        404  /products/mithila-makhana
```

The static routes recover; only the `dynamicParams = false` dynamic route does
not.

**Fix:** drop the per-slug `revalidatePath` calls. The tag was always the
correct mechanism — every catalogue read goes through
`unstable_cache(..., { tags: [PRODUCTS_TAG] })`, so `revalidateTag` marks the
pages stale and they regenerate on the next request while still serving the
previous copy. Verified end to end: after the fix, a price changed directly in
MySQL followed by `/api/revalidate` leaves all pages at 200 and the new price
appears. The `revalidatePath` calls were not only harmful, they were
redundant.

**Why nothing caught it earlier.** The M2 DB-down test browses with MySQL
stopped, but it runs well inside the one-hour ISR window, so pages come from
the build-time cache and no revalidation is ever triggered. The gap was that
nothing exercised *revalidation* as opposed to *rendering*.

`scripts/chaos.mjs` now forces a revalidation on demand — same code path, no
waiting an hour — and asserts all five product pages still return 200, both
during a database outage and after it clears.

---

## 5. Chaos — MySQL dies under live traffic

`scripts/test-db-down.mjs` covers the static case: stop the database, then
browse. This covers the harder one, where it disappears mid-flight with
requests already in progress. **15 checks, all passing** — including the
forced-revalidation regression described above.

### Killed during a browse load (200 rps)

- Product page still returns **200 with real content** — the actual copy, a
  rupee price, and `"@type":"Product"` JSON-LD, not a fallback shell that
  happens to return 200.
- Catalogue still 200.
- k6 saw **0.000% failures across the outage**, thresholds held.
- `/api/health` reported `db: "down"` during, and flipped back on restart.

### Killed during checkout traffic

| outcome | count |
|---|---:|
| 201 created | 37 |
| 503 refused | 23 |
| 500 | 0 |
| threw / timed out | 0 |

Every 503 carried the `DB_UNAVAILABLE` contract code, and checkout **recovered
on its own** once MySQL returned — no restart, no intervention.

Checkout genuinely cannot work without a database, so the requirement is not
"keep working" but "fail honestly, charge nothing, recover unattended". It
does.

The chaos run places real orders against real stock, so it puts the units back
and deletes its own orders before exiting.

---

## Caveats

- One laptop, load generator co-located with the server. Read the error rates
  and the shape; do not read the milliseconds as production numbers.
- The rps ladder was run once per rate, not repeated for variance. Run-to-run
  spread at 500 rps was visible (p95 between 543 ms and 690 ms across runs).
- 10,000 literal VUs was not attempted. `MODE=vus` exists for hardware that
  can drive it (`k6 run -e MODE=vus -e VUS=10000`), but from one laptop the
  load generator would hit its own limits well before the server did, which
  measures the wrong thing. The arrival-rate model above is the honest
  substitute.
- Checkout was tested at 50 rps, which is far beyond any realistic order rate
  for this catalogue. It is a correctness test wearing a load test's clothes.
