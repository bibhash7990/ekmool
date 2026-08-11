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
pnpm --filter mobile exec eas login
pnpm --filter mobile exec eas init          # writes the project id
```

`eas init` prints a project id. Put it in `apps/mobile/.env.local` as
`EAS_PROJECT_ID` — `app.config.ts` reads it from there. It is not a secret,
but it is per-account, which is why it is not checked in.

Also set `EXPO_PUBLIC_API_URL` to the origin the app should talk to. For a
build that will run on a phone, that is the deployed site, not localhost —
a device is not the machine running the server, so `localhost` reaches the
phone itself and nothing else.

---

## The builds

```bash
# Android. app-bundle is what the Play Store takes; production-apk is the
# same build as an APK you can sideload onto a real handset in one step.
pnpm --filter mobile exec eas build --profile production-apk --platform android

# iOS → TestFlight → a physical iPhone.
pnpm --filter mobile exec eas build --profile production --platform ios
```

`appVersionSource: "local"` in `eas.json` means the version comes from
`app.config.ts`, in the diff, where a reviewer sees it change — rather than
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
