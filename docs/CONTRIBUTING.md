# Working on this

Read `docs/ARCHITECTURE.md` first. Then this, once. Then the document for
whatever you are touching.

---

## Setting up

```bash
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# a different value for each of SESSION_SECRET, CRON_SECRET, REVALIDATE_SECRET

npm install
npm run db:up && npm run db:migrate && npm run db:seed
npm run dev
```

No third-party keys are needed. The site builds, runs and takes Cash on
Delivery orders with none configured — see `docs/keys-needed.md` for what
each one adds.

Or the whole stack in one command:

```bash
npm run docker:up
```

---

## The rules that are not negotiable

These are the ones a reviewer will send a PR back for without discussion.
Each has a longer explanation in the linked document.

1. **TypeScript strict. No `any` on an exported surface.** Widening a type
   to make an error go away moves the error to runtime.
2. **Parameterised SQL only.** One documented `LIMIT` exception, clamped.
   → `docs/DATABASE.md`
3. **Secrets only from the environment.** No placeholder credentials, ever.
   → `docs/SECURITY.md`
4. **Money is integer paise.** Rupees only in forms and exports, converted
   in one place. → `docs/DATABASE.md`
5. **Never fabricate social proof.** No seeded reviews, no invented ratings,
   no urgency counter that is not literally true from stock.
   → `docs/DESIGN-SYSTEM.md`
6. **Design tokens only.** A hardcoded hex in a component is a review
   failure. → `docs/DESIGN-SYSTEM.md`
7. **Guest checkout never requires login.** There is no registration and
   there must never be one. → `docs/ARCHITECTURE.md`
8. **Browsing never touches the database.** → `docs/ARCHITECTURE.md`
9. **Never `revalidatePath` a product route.** → `docs/ARCHITECTURE.md`
10. **Nothing that has been sold is deleted.** Archive it.
    → `docs/DATABASE.md`
11. **Accessibility stays at 100.** Focus rings, 44px targets, visible
    labels, 4.5:1. → `docs/DESIGN-SYSTEM.md`
12. **Ask before adding a dependency.** See below.

---

## Dependencies

The project has taken **one** new runtime dependency since v1.0.0
(`ioredis`), and it was asked for and approved before it was installed.

Before adding one, answer three questions in the PR:

1. What does it do that forty lines of ours would not?
2. What does it pull in? (`npm ls <pkg>`, and look at the tree.)
3. What happens when it is unmaintained in two years?

Things deliberately **not** taken, with the reasoning, so you do not have to
re-litigate them:

| Not taken | Instead | Why |
|---|---|---|
| `@aws-sdk/client-s3` + presigner | `src/lib/storage.ts` | ~40 packages to produce one signed URL; SigV4 is a documented HMAC chain `node:crypto` already has |
| A CSV library | `src/lib/csv.ts` | RFC 4180 quoting is twelve lines, and we needed a formula-injection guard no library ships by default |
| Workbox | `public/sw.js` | A hand-written worker is 250 readable lines and no build step |
| An ORM | raw `mysql2` | Every query that matters is one an ORM would fight |
| A search library / FULLTEXT | `src/lib/search.ts` | At five products an in-memory scan is faster, survives MySQL being down, and can match "haldi" to turmeric — which the index could not |
| A reCAPTCHA SDK | Turnstile via `<script>` + `fetch` | No dependency, no puzzle for real users |

`ioredis` was taken because hand-rolling connection pooling, reconnection
and pipelining is infrastructure written badly to save one package — unlike
SigV4, which is a pure function.

---

## Definition of done

A change is finished when all of these are true. Not most.

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] The suites that cover what you touched are green (table below)
- [ ] `npm run audit` passes — SEO and a11y **100**, script budget held
- [ ] New behaviour has a test that would fail without it
- [ ] Comments explain **why**, not what
- [ ] Docs updated if you changed a rule, a schema or an env var
- [ ] `.env.example` updated if you added a variable
- [ ] Works with the relevant third-party key **removed**

### Which suite covers what

| Command | Covers |
|---|---|
| `test:checkout` | Idempotency, atomic stock, oversell, webhook signature |
| `test:account` | Lookup, enumeration resistance, session scoping, cancellation |
| `test:commerce` | GST arithmetic and split, invoice numbering, returns, re-order |
| `test:consent` | Security headers, nothing tracks before consent, honeypot |
| `test:discovery` | Search ranking, filters, PIN estimates, wishlist scoping |
| `test:promotions` | Coupon arithmetic and caps, GST on a discounted line, reviews |
| `test:admin` | CSV escaping, presigned uploads, product CRUD, reports, audit log |
| `test:offline` | Service worker exclusions, manifest, PWA CSP, shared limiter |
| `test:jobs` | Cron auth, stale-order cancel, reminder dedupe |
| `chaos` | MySQL killed under live traffic |
| `test:db-down` | Browsing with MySQL stopped |
| `validate:schema` | Titles, canonicals, JSON-LD, internal links |

Most need a running server (`npm run standalone:start`). `test:admin` needs
only the database. **Run `test:db-down` from a warm cache**, and not
straight after `chaos` or `test:admin` — both end by hard-purging the
catalogue tag, and an expired static page with no database has nothing to
serve.

Suites are **not parallel-safe**: several drive checkout through the same
rate limiter, and running them together produces 429s that look like
failures and are not. CI runs them sequentially, each as its own step.

---

## Tests

The style is a plain script per area — no framework, no config, no watcher.
Each prints `PASS`/`FAIL` lines and exits non-zero. They run against a live
server and a live database because that is where the bugs are.

**Write the assertion so it would fail.** A test that passes against both
the fixed and the broken code is worse than none: it costs the same to run
and it buys confidence that is not there.

Clean up after yourself. Every suite deletes its own rows and asserts that
it left nothing behind.

Name assertions in English, describing the property, not the mechanics:

```js
check("a slug with an order behind it cannot be renamed", slugRefused);
check("editing a pack does not touch its stock", after === before);
```

---

## Comments

The codebase is heavily commented, and the comments carry the reasoning that
is not visible in the code — why a lock is taken in that order, why
`enableOfflineQueue` differs between two Redis connections, why a report
groups on IST.

- Explain **why**. The code says what.
- When you make a non-obvious choice, write down the alternative you
  rejected and the reason.
- When something was measured, say it was measured and what the number was.
  "Measured: 188 → 195 KB" ends an argument that "should be lighter" starts.
- Delete a comment that has become false in the same commit that made it
  false. A stale comment is worse than none.

---

## Commits

One commit per coherent change. The message body explains the reasoning —
these commits are the project's history of *why*, and they get read.

```
feat(m14): product CRUD, returns queue, reports with CSV, audit log

Nothing is deleted. order_items.variant_id is ON DELETE SET NULL, so
removing a variant would not fail — it would quietly detach the line
from every order that contained it.
```

Prefixes: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`.

---

## CI

`.github/workflows/ci.yml` runs on every push to `main` and every PR:

1. **Types and lint** — fast, no services, fails in ninety seconds on a typo
2. **Build and test** — MySQL and Redis, a production build, every suite
3. **Lighthouse budget** — its own job so a failure is legible in the checks

The reports upload as an artifact, so a budget failure can be read rather
than guessed at.

---

## Adding a milestone-sized feature

The pattern that has worked for fifteen of them:

1. Migration first, with a comment block explaining the reasoning.
2. Query module in `src/db/queries/` — pure data access, transactions where
   concurrency matters.
3. Pure logic in `src/lib/` — arithmetic, no I/O, easy to assert on.
4. Server action or route handler — Zod, auth, then call the query.
5. UI — server components, client only at the interactive leaf.
6. A test script that would fail without the feature.
7. Docs, `.env.example`, README.
8. Run everything, including `audit`.
9. One commit; tag if it is a milestone.

---

## Related

`docs/ARCHITECTURE.md` · `docs/DATABASE.md` · `docs/DESIGN-SYSTEM.md` ·
`docs/PERFORMANCE.md` · `docs/SECURITY.md` · `docs/docker.md` ·
`docs/deploy.md` · `docs/keys-needed.md`
