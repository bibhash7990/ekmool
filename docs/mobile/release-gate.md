# The Phase 3 release gate

**This is the exit criterion that decides Phase 3, and it is the one thing
in the programme that cannot be run from a repository.** It needs an Expo
account, a physical Android phone and a physical iPhone. Everything else in
the phase was arranged around getting here early.

Run it on the skeleton, before the screens feel finished. The defect it
looks for is invisible in development and appears only in a Release build;
finding it in Phase 6 with a store deadline is the difference between a bad
afternoon and a bad month.

---

## What it is looking for

`expo/expo#47687`. On iOS **Release builds only**, expo-router with a `Tabs`
layout where each tab hosts its own nested `Stack` hangs forever on the
native splash screen — the navigator's first Fabric commit never completes.
Debug builds never reproduce it.

The app is built flat for exactly this reason: one root `Stack` in
`app/_layout.tsx`, four tabs with no navigator of their own, and every
detail screen pushed onto the root. `pnpm check:mobile` fails the build if a
second `Stack` appears under `app/(tabs)/`. The reported fix took a
production app from 0/10 to 10/10 cold launches.

That check is a grep. **This gate is the proof.**

---

## Before the first build

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init          # prints the project id
```

`npx`, not a dependency. `eas-cli` is a build tool rather than something the
app imports, it releases weekly, and rule 12 costs a conversation — so it is
fetched per invocation instead of pinned in `package.json`.

**This is already done for `@bibhashs-team/ekmool` and needs repeating only
for a new account.** `owner` and `extra.eas.projectId` are checked into
`app.config.js`, so no environment variable is required to build.

Three things cost an evening the first time, all recorded so they cost
nobody a second one:

- **`.env.local` cannot carry `EAS_PROJECT_ID`.** eas-cli evaluates the
  config in its own process and does not load `.env` files. The value is
  simply absent, and the error — *"EAS project not configured. Must
  configure EAS project by running 'eas init'"* — points at the wrong
  problem. That is why the id is a literal in the config.
- **A project's slug cannot be renamed after creation.** The dashboard
  rename changes the display name only; `project:info` keeps returning the
  original slug, and every command fails with `Slug for project identified
  by "extra.eas.projectId" (x) does not match the "slug" field (y)`. The
  first project here was created as `ekmoool` and had to be replaced.
  **Do not fix this by editing `slug`** — it is what expo.dev URLs and
  update manifests are built from.
- **`eas init` cannot write to a dynamic config.** It prints the fields and
  stops. Paste them in by hand; the CLI is not being unhelpful, it just
  cannot safely rewrite code.

For a fresh account: `npx eas-cli@latest init` with `extra.eas.projectId`
removed, then paste back the id and `owner` it prints.

`EXPO_PUBLIC_API_URL` is different and the distinction has teeth. It is
inlined into the JS bundle, and **the bundle is built on EAS's servers**.
`.env.local` is gitignored, EAS does not upload gitignored files, so a value
set only there is absent exactly where it is needed. The result is an app
that installs, launches, and shows every screen empty — which looks like an
app bug and is not one. It is declared in `eas.json`'s `env` for that reason;
see the comment there.

---

## The builds

```bash
# From apps/mobile.
#
# Android: app-bundle is what the Play Store takes; production-apk is the
# same build as an APK you can sideload onto a real handset in one step.
npx eas-cli@latest build --profile production-apk --platform android

# iOS → TestFlight → a physical iPhone.
npx eas-cli@latest build --profile production --platform ios
```

**If EAS offers to install `expo-updates`, say no.** It offers because a
build profile names a `channel`, and it will install the package, edit
`package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`, and then stop —
because it cannot write `updates.url` into a dynamic config either. The
channels have been removed from `eas.json` so it stops asking.

That is not only about rule 12. `expo-updates` can hold the native splash
screen while it checks for a new bundle, which is **the same symptom this
gate exists to detect**. Installing it now would make a hang ambiguous
between #47687 and an update check, and would change the cold-start number
this gate is supposed to establish as a baseline — a measurement invalidated
by the next phase is worse than none. OTA updates, channels and
`runtimeVersion` are Phase 6's subject, and belong in a build measured
against the number this one produces.

**The config is `app.config.js`, not `.ts`, and that is not a style
preference.** `eas-cli` bundles its own TypeScript and currently resolves
version 7, whose `require('typescript')` no longer exposes the compiler API —
so every `eas` command that reads a TypeScript config dies with `Cannot read
properties of undefined (reading 'CommonJS')`. The full account, including
the alternative that was tested and rejected, is in the header of
`apps/mobile/app.config.js`. Do not rename it back without checking that
first.

`appVersionSource: "local"` in `eas.json` means the version comes from
`app.config.js`, in the diff, where a reviewer sees it change — rather than
from a counter on Expo's servers that the repository cannot see.

---

## Assert, on both, on real hardware

- [ ] Launches past the native splash to the catalogue, **ten times out of
      ten**, from cold. Not nine.
- [ ] Tab switching and product push feel immediate
- [ ] Airplane mode: the catalogue still renders from cache
- [ ] No red screen, no silent hang
- [ ] **Record the cold-start time to first catalogue paint.** A number, not
      an adjective — it becomes Phase 5's baseline, and "it felt fast on my
      phone" is not a baseline

**An emulator does not count.** #47687 is timing-sensitive and is reported
as appearing in larger apps and Release builds; a machine faster or slower
than the target hardware is not evidence. The target is stated in
`docs/PERFORMANCE.md`: a mid-range Android phone on a 4G connection in an
Indian city.

---

## If iOS hangs anyway

That is decision D1's reversal condition, and it is written down so nobody
has to improvise under pressure:

1. Pin Expo SDK 56 and re-run this gate.
2. Record what happened in `research/mobile-stack-research.md` — **with the
   build numbers**, because the next person will want to know whether SDK 58
   fixed it.

Do not start rearranging screens to make it go away. The flat structure is
already the documented workaround; if it hangs regardless, the SDK is the
variable.

---

## Related

[Phase 3](phase-3-app-foundation.md) · [Phase 6](phase-6-release-engineering.md) ·
[`pending.md`](../../pending.md)
