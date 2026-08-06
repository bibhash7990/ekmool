# Documentation

Start here if you are new. The first three are the ones to read before
writing code; the rest are reference for when you need them.

| | |
|---|---|
| **[CONTRIBUTING.md](CONTRIBUTING.md)** | Setup, the twelve non-negotiable rules, definition of done, how to add a feature |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | How the application is shaped — rendering strategy, caching, module boundaries, graceful degradation |
| **[DATABASE.md](DATABASE.md)** | Schema conventions, migrations, money, concurrency, lock order, what never gets deleted |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | Colour, type, space, components, motion, accessibility, copy voice |
| [PERFORMANCE.md](PERFORMANCE.md) | The script budget and how not to spend it, caching layers, measuring |
| [SECURITY.md](SECURITY.md) | Secrets, auth, input, rate limits, headers, uploads, exports, DPDP |
| [docker.md](docker.md) | The one-command stack, the edge profile, staging |
| [deploy.md](deploy.md) | Vercel and VPS, backups and restore, staging, uptime monitoring |
| [keys-needed.md](keys-needed.md) | What to sign up for, in what order, and what each unlocks |
| [audit.md](audit.md) | Lighthouse results and the defects the gates caught |
| [loadtest.md](loadtest.md) | Load, chaos and failure testing |

---

## If you are here to…

| …do this | read |
|---|---|
| Add a page | DESIGN-SYSTEM § *Adding a page*, then ARCHITECTURE § *Rendering* |
| Add a database table or column | DATABASE, all of it |
| Change a price, tax or discount | DATABASE § *Money*, then `src/lib/gst.ts` and `src/lib/coupons.ts` |
| Add a form or an API route | SECURITY § *Input*, § *Rate limiting* |
| Add a third-party service | ARCHITECTURE § *Graceful degradation*, keys-needed |
| Work out why a page got heavy | PERFORMANCE, then `npm run audit` |
| Deploy, or scale past one container | deploy, docker, PERFORMANCE § *Scaling out* |
| Understand an odd-looking decision | Look for the comment. It is almost always there, and it says why |

---

## The one-line version

One Next.js app and one MySQL database. Browsing is static and never
touches either the database or a third party. Every integration is
optional and degrades to a documented inert state. Money is integer paise,
SQL is parameterised, nothing that has been sold is deleted, and nothing
about a customer is ever invented.
