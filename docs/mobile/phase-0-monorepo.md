# Phase 0 — Monorepo conversion

**Deliverable:** the same web application, byte-identical in behaviour,
living at `apps/web/` inside a pnpm + Turborepo workspace, with every
deployment path repaired and every existing gate green.

**Not in this phase:** any shared package, any API change, any React Native.
Nothing new is built. This phase moves things and fixes what the move broke.

**Why it is first and alone.** The move touches the Dockerfile, three CI
jobs, the Vercel project root, the Render blueprint and every path-resolving
script. Those are the code paths that only run in production. Entangling
them with a new mobile app means that when the first deploy fails, there are
two candidate causes instead of one. Ship this, watch production for a day,
then start Phase 1.

---

## Target layout

```
ekmool/
  package.json              workspace root — scripts that fan out, nothing else
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json        strict, shared compilerOptions
  .npmrc
  docs/                     stays at the root — it describes the whole repo
  research/                 stays at the root
  apps/
    web/                    everything that is the Next.js app today
      src/  public/  scripts/  next.config.ts  tsconfig.json  package.json …
  packages/                 created empty in Phase 0, filled in Phase 1
```

`docs/` and `research/` stay at the root deliberately: they document the
repository, not the web app, and Phase 3 adds mobile documents beside the
existing ones rather than in a second docs tree.

`docker/`, `docker-compose*.yml`, `render.yaml`, `vercel.json`,
`.github/` and `Dockerfile` also stay at the root — they are
infrastructure for the repo, and Render's blueprint in particular resolves
`dockerfilePath` from the repo root.

---

## Decisions

**D2 — the web app moves to `apps/web/`, rather than staying at the root
with `apps/mobile/` beside it.**

The tempting shortcut is to leave the Next app where it is and add one
sibling directory. It is a trap. The root `package.json` would then be both
the workspace root and a workspace member; `pnpm --filter` cannot address it
cleanly, Turborepo treats root tasks differently from package tasks, and
every tool that walks up looking for the nearest `package.json` finds the
wrong one. The cost of the move is one afternoon of path edits that are
fully testable locally. The cost of not moving is a permanent, low-grade
confusion in every tool for the life of the repository.

**D3 — pnpm, not npm workspaces and not Bun.**

The property being bought is the isolated store: `apps/web` gets React
19.2.8, `apps/mobile` gets the 19.2.3 that Expo SDK 57 pins, and neither can
see the other's copy. npm's hoisting makes that a fight. Expo has supported
pnpm's default isolated linker natively since SDK 54, and SDK 56's on-demand
filesystem removed the `watchFolders` workaround that used to make this
painful. pnpm 11.5.1 is already installed on this machine.

**`nodeLinker: hoisted` is not set, and adding it is a last resort.** It is
the documented escape hatch for Expo monorepo trouble, and reaching for it
pre-emptively gives up the isolation that is the entire reason for choosing
pnpm. If Metro cannot resolve something in Phase 3, fix the resolution;
switch the linker only after that has failed, and write down what failed.

---

## Root files, in full

### `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`onlyBuiltDependencies` will need entries once native tooling arrives in
Phase 3 (pnpm 11 refuses lifecycle scripts by default). Leave it out now;
add it with the packages that need it, so each entry has an obvious reason.

### `.npmrc`

```
# Expo SDK 54+ supports pnpm's default isolated store. We are not hoisting:
# apps/web is on React 19.2.8 and apps/mobile will be on the 19.2.3 that
# Expo SDK 57 pins, and isolation is the only thing keeping those apart.
node-linker=isolated
strict-peer-dependencies=false
```

`strict-peer-dependencies=false` is required, not preferred: the React
Native ecosystem's peer ranges are routinely behind the SDK that ships them,
and a strict install fails on warnings that Expo itself considers correct.

### `turbo.json`

```jsonc
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "stream",
  "tasks": {
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "lint":      { "outputs": [] },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"],
      // The web build reads MySQL to prerender product pages, so its output
      // is not a pure function of the source. Caching it would serve a
      // stale catalogue from a cache hit — the same class of bug as
      // revalidatePath on a product route. Left uncached on purpose.
      "cache": false
    }
  }
}
```

The `cache: false` on `build` is the one non-obvious line in this file and
the comment must survive into the committed version. Turborepo's whole value
proposition is caching builds; here, caching the *web* build would be
wrong, and the reason is the same architectural property that rule 8 and
rule 9 protect.

### Root `package.json`

```jsonc
{
  "name": "ekmool",
  "private": true,
  "packageManager": "pnpm@11.5.1",
  "engines": { "node": ">=22.13" },
  "scripts": {
    "dev":       "turbo dev --filter=web",
    "build":     "turbo build --filter=web",
    "typecheck": "turbo typecheck",
    "lint":      "turbo lint",
    "web":       "pnpm --filter web"
  },
  "devDependencies": { "turbo": "2.10.9", "typescript": "^5" }
}
```

`engines.node` states `>=22.13` because that is Expo SDK 57's floor, which
becomes a repository-wide floor in Phase 3. Stating it now means the
constraint is recorded once rather than discovered later.

**The `test:*`, `audit`, `chaos`, `db:*`, `docker:*` and `backup` scripts do
not move to the root and do not get Turbo wrappers.** They are web-app
scripts, they stay in `apps/web/package.json`, and they are run as
`pnpm --filter web test:checkout`. Wrapping them in Turbo would add a task
graph to scripts that are explicitly documented as not parallel-safe.

---

## The migration, step by step

Do this on a branch. Every command is a real command; none of it is
illustrative.

### 1. Move the tree, preserving history

```bash
git switch -c chore/monorepo

mkdir -p apps/web packages

git mv src public scripts apps/web/
git mv next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs \
       mdx-components.tsx next-env.d.ts instrumentation.ts \
       instrumentation-client.ts sentry.server.config.ts \
       sentry.edge.config.ts package.json apps/web/

git rm --cached package-lock.json && rm package-lock.json
rm -rf node_modules .next tsconfig.tsbuildinfo
```

`git mv` rather than a plain move: `git log --follow` keeps working, and
this repository's commit messages are its record of *why*. Losing that to
save four keystrokes is not a trade.

`.env.local` and its variants stay at the repository root. `next dev` and
`next build` read `.env.local` from the app directory, so **the app needs
one too** — see step 6. Do not commit either; `.gitignore` already covers
them.

### 2. Write the root files

The four files above. Then `apps/web/package.json`:

- `"name": "web"` — this is the `--filter` handle everywhere
- keep every existing script exactly as it is
- keep every dependency exactly as it is, at the same versions
- add nothing

### 3. `tsconfig.base.json` at the root, `apps/web/tsconfig.json` extending it

Move the shared compiler options up; leave everything Next-specific and
every path alias in the app's own file:

```jsonc
// apps/web/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": [
    "next-env.d.ts", "**/*.ts", "**/*.tsx",
    ".next/types/**/*.ts", ".next/dev/types/**/*.ts", "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

`allowImportingTsExtensions` must survive the move into the base config —
`scripts/*.mts` run through Node's native type stripping and need the real
extension in the specifier. Dropping it breaks `db:migrate` and the cron
runner, and it breaks them at runtime, not at typecheck.

### 4. `next.config.ts` — `outputFileTracingRoot`

**This is the step that fails silently if it is skipped.**

```ts
import path from "node:path";

// In a monorepo, file tracing defaults to the app directory and misses the
// hoisted dependencies at the workspace root, so `output: "standalone"`
// emits a server that cannot start. Pointing the root at the workspace
// makes tracing correct — and changes the shape of the output tree, which
// is why scripts/standalone.mjs, the Dockerfile COPY paths and
// standalone:start all move down one level. See step 5.
outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
```

**`outputFileTracingRoot` changes the layout *inside* the standalone tree.
It does not move the tree.** `output: "standalone"` always writes to
`<distDir>/standalone`, and `distDir` is still `.next` under the Next
project — so the directory itself is at **`apps/web/.next/standalone`**, and
its contents are laid out from the workspace root:

```
apps/web/.next/standalone/
  node_modules/                 hoisted deps, traced from the workspace root
  apps/web/
    server.js                   ← the entry point moved
    .next/                      ← and the server chunks with it
```

Two roots, one path. Read that tree twice before writing a `COPY` line.

Three things must follow it down:

| Was | Becomes |
|---|---|
| `standalone:start` → `node .next/standalone/server.js` | `node .next/standalone/apps/web/server.js` |
| `scripts/standalone.mjs` copying into `standalone/.next/static`, `standalone/public`, `standalone/.env.local` | `standalone/apps/web/.next/static`, `standalone/apps/web/public`, `standalone/apps/web/.env.local` |
| Dockerfile `COPY --from=standalone-builder /app/.next/standalone ./` and the two lines after it | see step 7 |

Miss any one of these and `npm run build` still succeeds. The failure
arrives at `standalone:start` as a bare "Cannot find module", or — worse —
as a server that boots and serves unstyled pages with no hydration, which is
exactly the failure mode `scripts/standalone.mjs`'s own header warns about.

### 5. Audit every path-resolving script

There are 27 files in `apps/web/scripts/`. Each one that computes a path
from `process.cwd()` or `import.meta.dirname` needs checking, because they
will now be run as `pnpm --filter web <script>`, whose cwd is `apps/web`,
but may also be invoked from the root by CI.

```bash
grep -rn "process.cwd()\|import.meta.dirname\|__dirname\|\.\./\.\." apps/web/scripts/
```

The known ones from reading them:

- `standalone.mjs` — `const root = process.cwd()`. Correct if run from
  `apps/web`; add an explicit guard that errors with a useful message rather
  than half-copying if `next.config.ts` is not in `root`.
- `audit.mjs`, `check-budget.mjs` — write reports into `research/audits/`,
  which is now two levels up. Either point them at the repo root explicitly
  or move the output under `apps/web/`. **Point them at the root**:
  `docs/PERFORMANCE.md` and `docs/audit.md` both name
  `research/audits/lh-home.json` in copy-pasteable commands, and breaking
  those is breaking documentation that is actively used.
- `register-alias.mjs` / `alias-loader.mjs` — these resolve `@/` for the
  scripts that run under `--conditions react-server`. They must follow the
  new `src` location.
- `load-env.mts` — reads `.env.local`. It now needs to find the one in
  `apps/web/`.
- `backup.mjs` — writes backups somewhere; confirm the destination is still
  intended after the move.

### 6. Environment files

`next dev` and `next build` read `.env.local` relative to the app root.
After the move that is `apps/web/.env.local`.

Do **not** copy the file. Add to `docs/CONTRIBUTING.md` and to the root
README that setup is now:

```bash
cp .env.example apps/web/.env.local
```

and leave `.env.example` at the repository root, where it documents the
whole system. One file, one location, one place to add a variable — which
matters in Phase 2 and again in Phase 6, both of which add variables.

### 7. Dockerfile

Four edits, all mechanical, all easy to get subtly wrong:

```dockerfile
# deps stage
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/web/package.json ./apps/web/
RUN corepack enable && pnpm install --frozen-lockfile

# builder / standalone-builder stages
# With node-linker=isolated the real packages live in the root's
# node_modules/.pnpm and each workspace member holds a tree of relative
# symlinks into it. Copying only the root leaves apps/web unable to resolve
# even `next`, so BOTH trees are copied and land at their original paths,
# which is what keeps the relative links valid.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
RUN pnpm --filter web build

# standalone stage — the entry point is one level down now
COPY --from=standalone-builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=standalone-builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=standalone-builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
CMD ["node", "apps/web/server.js"]
```

**All three sources are under `/app/apps/web/`.** An earlier draft of this
document had the first one at `/app/.next/standalone`, on the assumption
that `outputFileTracingRoot` moves the standalone directory. It does not —
it changes the layout inside it. Two agents caught the error independently
while implementing this phase, which is the only reason it is not in the
Dockerfile.

The comment block above `standalone-builder` — *"KEEP THESE TWO STAGES
LAST. Render's blueprint has no field for selecting a build target"* — still
applies and must not be disturbed. Adding a stage below it silently changes
what Render ships.

The `deps` stage comment says dev dependencies are required because the
image performs the build. Still true. `pnpm install --frozen-lockfile`
installs them by default.

### 8. `.dockerignore`

It currently excludes `node_modules` and `.next` at the root. It now needs
`apps/*/node_modules`, `apps/*/.next`, `packages/*/node_modules` and
`**/*.tsbuildinfo`. Miss this and the build context grows by hundreds of
megabytes and the `deps` layer cache stops working, which reads as "Docker
got slow" rather than as a bug.

### 9. CI — `.github/workflows/ci.yml`

Three jobs, all of which run `npm ci` and then `npm run <script>`.

```yaml
- uses: pnpm/action-setup@v4
  with: { version: 11.5.1 }
- uses: actions/setup-node@v4
  with:
    node-version: ${{ env.NODE_VERSION }}
    cache: pnpm
- run: pnpm install --frozen-lockfile
```

Then: `npm run typecheck` → `pnpm turbo typecheck`, `npm run lint` →
`pnpm turbo lint`, and every `npm run test:*` → `pnpm --filter web test:*`.
Bump `NODE_VERSION` from `"22"` to `"22.22"` or leave it — `22` resolves to
the latest 22.x, which is above Expo's 22.13 floor. Leave it, and note why
in the phase commit rather than adding churn.

**Keep the three jobs separate and keep the suites sequential.**
`docs/CONTRIBUTING.md` states they are not parallel-safe because several
drive checkout through the same rate limiter. Turborepo's instinct is to
parallelise; it must not be given the chance here.

### 10. Vercel and Render

- **Vercel** — two changes, one of them invisible in a diff.

  1. The project's *Root Directory* must be set to **`apps/web`** in the
     dashboard. **This setting is not in the repository.** Until it is
     changed, a build runs against a root that contains no Next
     application and fails. Vercel detects pnpm from `packageManager` and
     the lockfile.
  2. **`vercel.json` moves to `apps/web/vercel.json`.** Vercel reads it
     from the configured Root Directory, not from the repository root —
     their monorepo documentation's own example is
     `apps/frontend/vercel.json`. Left at the root it is simply not read,
     and the failure is silent: the site deploys perfectly and the three
     cron jobs stop firing. Nobody notices until an abandoned-payment
     reminder does not go out.

  A failed build does **not** take the site down. Vercel keeps serving the
  last successful production deployment, so the cost of getting the order
  wrong is "no new deploys until it is fixed", not an outage. Change the
  Root Directory first anyway.
- **Render** — `render.yaml` sets `dockerfilePath: ./Dockerfile` with the
  repo root as context, which stays correct. The Dockerfile edits in step 7
  carry it. Confirm no `buildCommand` or `startCommand` in the blueprint
  references `npm`; the grep in preparation found none, but re-check after
  editing.

### 11. `.gitignore`

Add `apps/*/.next`, `apps/*/node_modules`, `packages/*/node_modules`,
`.turbo/`, `**/*.tsbuildinfo`. Remove `tsconfig.tsbuildinfo` from the repo
if it is tracked — it is 437 KB of build state and it is in the tree today.

---

## Verification — the whole matrix, once

This phase claims the web app is unchanged. That claim is only worth
anything if it is tested against everything, not against the parts that
seemed likely to break.

```bash
pnpm install
pnpm turbo typecheck lint

pnpm --filter web db:up
pnpm --filter web db:migrate
pnpm --filter web db:seed
pnpm --filter web build
pnpm --filter web standalone
pnpm --filter web standalone:start        # in another terminal

pnpm --filter web validate:schema
pnpm --filter web test:admin
pnpm --filter web test:home 3100
pnpm --filter web test:checkout 3100
pnpm --filter web test:account 3100
pnpm --filter web test:commerce 3100
pnpm --filter web test:consent 3100
pnpm --filter web test:discovery 3100
pnpm --filter web test:promotions 3100
pnpm --filter web test:jobs 3100
pnpm --filter web test:offline 3100
pnpm --filter web run audit 3100
```

Sequentially, in that order, for the reason in `docs/CONTRIBUTING.md`.
Then, from a **warm cache** and not straight after `test:admin`:

```bash
pnpm --filter web test:db-down
pnpm --filter web chaos
```

And the Docker path, which CI does not cover:

```bash
pnpm --filter web docker:up
pnpm --filter web docker:staging
```

### The numbers that must not move

`npm run audit` currently reports **178 / 181 / 184 / 176 KB** for `/`,
`/products`, `/products/[slug]` and `/blog/[slug]`. A monorepo move changes
no source, so these must come back the same — within the ~9 KB of prefetch
noise that `docs/PERFORMANCE.md` documents. **If a total shifts, compare the
chunk list, not the total**, using the one-liner in that document, pointed
at the new `research/audits/` path. A new filename means a real regression;
a different number with the same filenames means Chrome reported a prefetch
differently, again.

SEO 100 and accessibility 100 are not noisy and must be exactly 100.

---

## Rollback

The branch is a pure move plus config edits. If production misbehaves after
merge, `git revert` the merge commit and reset the Vercel root directory
back to `.`. Both halves are needed — reverting the code while Vercel still
points at `apps/web` deploys nothing at all, which looks like a much more
frightening failure than it is. Write that pair down in the PR description,
not just here.

---

## Exit criteria

- [ ] Every command in the verification matrix run, in order, green
- [ ] Lighthouse: SEO 100, a11y 100, script budget held; chunk lists compared
      filename-by-filename against a pre-move run
- [ ] `chaos` and `test:db-down` green from a warm cache
- [ ] `docker:up` and `docker:staging` both serve `/api/health`
- [ ] Vercel root directory changed, and a preview deploy of the branch
      confirmed serving before merge
- [ ] A Render deploy from the branch confirmed, or the blueprint change
      reviewed by someone who has deployed it
- [ ] `git log --follow apps/web/src/lib/money.ts` shows the file's full
      history — proof the move preserved it
- [ ] `docs/CONTRIBUTING.md` setup section updated for pnpm and the new
      `.env.local` location
- [ ] `packages/` exists and is empty, with a `.gitkeep`
- [ ] No `package-lock.json` anywhere; `pnpm-lock.yaml` committed
- [ ] Production deployed and watched for 24 hours before Phase 1 starts

---

## Related

[Programme index](README.md) · [Phase 1 →](phase-1-shared-packages.md) ·
[`research/mobile-stack-research.md` §3](../../research/mobile-stack-research.md) ·
[`docs/docker.md`](../docker.md) · [`docs/deploy.md`](../deploy.md) ·
[`docs/CONTRIBUTING.md`](../CONTRIBUTING.md)
