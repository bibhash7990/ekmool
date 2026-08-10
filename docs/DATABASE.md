# Database

MySQL 8.4, InnoDB, `utf8mb4_0900_ai_ci` throughout. Eight migrations,
nineteen tables. Raw SQL through `mysql2/promise` — no ORM.

**Why no ORM.** Every query that matters here is one an ORM would fight:
`SELECT … FOR UPDATE` in a specific lock order, an atomic decrement with a
guard in the `WHERE`, a largest-remainder allocation, a per-financial-year
counter. Writing them by hand is shorter than persuading a query builder to
emit them, and it means the SQL in the repository is the SQL that runs.

---

## The rules

### 1. Parameterised SQL, always

```ts
// yes
pool.execute("SELECT … WHERE slug = ?", [slug]);

// never, under any circumstance
pool.query(`SELECT … WHERE slug = '${slug}'`);
```

**The one exception is `LIMIT`,** which MySQL will not accept as a
placeholder in a prepared statement. Interpolate it only after clamping to
an integer, and say so at the call site:

```ts
// LIMIT is interpolated (after clamping to an integer) because MySQL will
// not accept a placeholder there in a prepared statement. Nothing from a
// request reaches it — the value is arithmetic, not text.
const capped = Math.min(Math.max(Math.floor(limit), 1), 100);
```

If you find yourself interpolating anything else, you have found a bug.

### 2. Money is an integer number of paise

Never a float, never rupees, never a `DECIMAL` the application rounds.
`price_inr` is paise despite the column name — the `COMMENT 'paise'` on it
is load-bearing.

- Database and application logic: **paise**.
- Admin forms and CSV exports: **rupees**, converted in exactly one place
  (the server action or the export builder).

Asking a human to type `64000` for ₹640 is how a product ships at a hundred
times its price. Handing an accountant a column headed "total" containing
`50220` is how it gets read as fifty thousand rupees.

Convert with `Math.round(rupees * 100)`. `558.55 * 100` is `55854.999…` in
IEEE 754.

### 3. Nothing that has been sold is deleted

`order_items.variant_id` is `ON DELETE SET NULL`. Deleting a variant does
not fail — it silently detaches the line from every order that contained it.

So: **archive** (`is_active = 0`). That removes it from the catalogue, from
search, and from checkout, which already requires
`v.is_active = 1 AND p.is_active = 1`. Coupons are switched off, never
deleted. Reviews are moderated to `rejected`, not removed.

The exceptions, and the test for one: is anything a snapshot of it?

| Really deleted | Because |
|---|---|
| `product_images` | No order line references an image id |
| `wishlist_items` | A note about a want, not a record of anything |
| `back_in_stock_requests` | Consumed when the mail goes out |
| `reviews`, `newsletter_subscribers` on erasure | Somebody's words, not a record anyone must keep |

Orders are **anonymised** on erasure, never deleted: they are financial
records with a statutory retention period. See
`apps/web/src/db/queries/privacy.ts`.

### 4. A slug is not a URL

`order_items.product_slug` is snapshotted on every line ever sold. Reviews
and wishlists are keyed on it. Google has indexed it. `updateProduct`
throws `SlugLockedError` when any of those point at it, and the admin says
which one rather than refusing without a reason.

### 5. Concurrency is handled in SQL, not in JavaScript

Read-then-write across an `await` is a race. The patterns actually used:

**Atomic decrement with a guard** — what prevents overselling:

```sql
UPDATE product_variants
   SET stock_qty = stock_qty - ?
 WHERE id = ? AND stock_qty >= ?
```

`affectedRows === 0` means insufficient stock. No read is involved and no
two requests can both succeed.

**`SELECT … FOR UPDATE`** where a value must be read and written as one
step: coupon claims, invoice counters, stock edits that must know the
previous value, return transitions.

**Unique indexes as the real guard.** `uq_orders_idempotency`,
`uq_orders_razorpay_payment`, `uq_reviews_order_product`,
`uq_return_order`, `uq_redemption_order`. The application's check-then-act
is the friendly path; the index is what is actually true. Catch
`ER_DUP_ENTRY` and translate it.

### 6. One lock order, everywhere

`createOrder` takes: **variant rows → coupon row → customer upsert.** Every
transaction that touches more than one of these takes them in that order. A
transaction that took the coupon before the variants would deadlock against
one that did not, under exactly the load where it matters.

### 7. Migrations only move forward

`apps/web/src/db/migrations/NNN_name.sql`, applied in filename order and recorded in
`_migrations`. Re-running is a no-op. There are no down migrations — write
a new file.

Before a migration that drops or narrows a column, take a backup and say so
in the PR. Every migration carries a comment block explaining *why*, not
what: `006_promotions.sql` opens with the GST reasoning that makes
`order_items.discount_paise` necessary.

### 8. Time is stored UTC and reported IST

`TIMESTAMP` columns are UTC internally and returned in the session time
zone — UTC in the Docker image. A naive `DATE(created_at)` puts every order
placed before 05:30 IST on the previous day, so "yesterday's revenue" is
wrong by a slice.

Use the `IST()` helper in `apps/web/src/db/queries/reports.ts`. It shifts by the
*measured* session offset rather than assuming UTC, and does the arithmetic
itself because `CONVERT_TZ` returns NULL when the named time-zone tables
are absent — which the official MySQL image does not ship, so the failure
mode is a silently empty report.

### 9. `GROUP_CONCAT` truncates at 1024 bytes

Silently. No error, no warning the application can see. It cost a 60-line
order its tail in a CSV export. Fetch the rows and join them in JavaScript.

---

## Table map

| Group | Tables |
|---|---|
| Catalogue | `products`, `product_variants`, `product_images` |
| Orders | `orders`, `order_items`, `order_status_history`, `invoice_counters` |
| Customers | `customers`, `customer_addresses` |
| Commerce | `coupons`, `coupon_redemptions`, `return_requests`, `reviews` |
| Retention | `newsletter_subscribers`, `back_in_stock_requests`, `wishlist_items`, `email_log` |
| Admin | `admin_audit_log` |
| Meta | `_migrations` |

### Column conventions

- `snake_case` columns, `camelCase` in TypeScript, mapped explicitly in the
  query module. No automatic mapping — an explicit mapper is where a
  renamed column fails loudly.
- Every table: `id`, `created_at`, and `updated_at ON UPDATE
  CURRENT_TIMESTAMP` where rows change.
- Booleans are `TINYINT(1)`, compared `=== 1` on the way out.
- Money is `INT UNSIGNED` with `COMMENT 'paise'`.
- Rates are basis points (`SMALLINT UNSIGNED`) — 5% is `500`. No floats
  anywhere near money.
- Emails are lowercased on write so the unique index is a real constraint
  rather than a collation coincidence.

### Indexes

Add one when a query filters or sorts on a column and the table can grow.
`idx_order_items_slug` exists because the top-products report groups by it;
`idx_orders_delivered` because the returns window compares against it. An
index that no query uses is a write cost with no reader — say which query
needs it in the migration comment.

---

## Writing a query module

```ts
import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/db/pool";

interface ThingRow extends RowDataPacket {
  id: number;
  display_name: string;
}

export interface Thing {
  id: number;
  displayName: string;
}

export async function getThing(id: number): Promise<Thing | null> {
  const pool = getPool();
  const [rows] = await pool.execute<ThingRow[]>(
    `SELECT id, display_name FROM things WHERE id = ?`,
    [id],
  );
  const row = rows[0];
  return row ? { id: row.id, displayName: row.display_name } : null;
}
```

Transactions: `getConnection()`, `beginTransaction()`, and a
`try/catch/finally` that rolls back and **always** releases. A leaked
connection is a pool exhaustion an hour later, in production, with no
stack trace pointing here.

---

## Local commands

```bash
pnpm --filter web db:up        # MySQL container
pnpm --filter web db:migrate   # apply pending migrations
pnpm --filter web db:seed      # catalogue content
pnpm --filter web db:reset-stock
```

Inspect:

```bash
docker compose exec mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ekmool
```

---

## Related

`docs/ARCHITECTURE.md` · `docs/SECURITY.md` · `docs/deploy.md` (backups and
restore)
