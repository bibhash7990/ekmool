# Phase 6 — Release engineering

**Deliverable:** a version scheme that cannot drift, EAS profiles that
produce the same artefact every time, an OTA policy that cannot ship a JS
update into a binary that will not run it, CI that builds and submits, and
store listings that pass review the first time.

**The stated requirement is "deploy in one go without any error".** No
process guarantees that. What a process can do is move each class of failure
somewhere it is cheap: a build failure into CI, a runtime hang into the
Phase 3 device gate, a store rejection into a checklist read before the
first submission rather than after the first rejection. That is what this
phase is.

---

## 1. Versioning

### Three numbers, and what each one means

| Number | Where | Changes when |
|---|---|---|
| `version` — `1.4.0` | `app.config.ts` | The release. Semver, chosen by a human. Visible to customers. |
| `android.versionCode` / `ios.buildNumber` | `app.config.ts` | Every build submitted to a store. Monotonic integers. |
| `runtimeVersion` | `app.config.ts` | The **native** contract: which binaries can run a given JS bundle. |

### D9 — `appVersionSource: "local"`

The version lives in the repository, in the diff that caused it, reviewed
like everything else. This is a project whose commit messages are its record
of *why*; a version number that changes on a build server, invisibly, is at
odds with that.

The alternative — `"remote"` with `autoIncrement: true` — is genuinely
convenient and it is rejected for two reasons. First, the documented
incompatibility: **`autoIncrement` is not supported with
`runtimeVersion: { policy: "nativeVersion" }`**. Second, a version that only
exists on EAS cannot be read from a git checkout, which makes "which commit
is build 41" a support ticket instead of a `git log`.

The cost is remembering to bump `versionCode`. That is a checklist item and
a CI check, not a reason to give up reviewability.

### `runtimeVersion` — the one that can break customers

Get this wrong and an OTA update lands on a binary that cannot run it, and
the app crashes on launch for everyone who received it. There is no remote
undo for a crash on launch.

```jsonc
"runtimeVersion": { "policy": "fingerprint" }
```

**Fingerprint policy.** It hashes the actual native inputs — dependencies,
config plugins, native configuration — so the runtime version changes if and
only if the native layer changed. Compare the alternatives:

- `"appVersion"` — the runtime version follows `version`. Documented trap:
  *"if you forget to bump the app version when changing the native runtime,
  you'll have a runtime version mismatch"*. It relies on a human noticing
  that adding a config plugin was a native change.
- `"nativeVersion"` — ties runtime to `version` + build number, and blocks
  `autoIncrement`. Also means every build is its own runtime, so an OTA
  reaches only one build.
- A hand-set string — works, until someone forgets.

Fingerprint removes the human from the decision that a human is worst at.

**A CI check must assert it.** Before publishing any update, compute the
fingerprint and compare it with the fingerprint of the build currently on
the channel. Different → refuse to publish and say a new binary is required.
`eas update` will not stop you from doing the wrong thing here; the pipeline
must.

---

## 2. `eas.json`

```jsonc
{
  "cli": { "version": ">= 21.7.0", "appVersionSource": "local" },
  "build": {
    "base": {
      "node": "22.22.3",
      "env": { "EXPO_PUBLIC_API_URL": "https://ekmool.in" }
    },
    "development": {
      "extends": "base",
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "extends": "base",
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "channel": "preview"
    },
    "production": {
      "extends": "base",
      "android": { "buildType": "app-bundle" },
      "channel": "production",
      "autoIncrement": false
    }
  },
  "submit": { "production": { /* … */ } }
}
```

Three things in there are load-bearing:

- **`node` pinned to an exact version.** "It built last week" is the most
  expensive sentence in release engineering, and an unpinned Node on a
  cloud builder is how it gets said. Expo SDK 57's floor is 22.13; the repo
  is on 22.22.3; pin that.
- **`preview` builds an APK, `production` builds an AAB.** The APK is for
  installing on a device by hand; the AAB is what the store gets. Never
  submit an APK, and never measure size from one (Phase 5 §1).
- **One channel per profile.** An update published to `preview` must be
  incapable of reaching a production install. The default is not this;
  the config has to say it.

### Credentials

Let EAS manage the Android keystore and the iOS certificates. The
alternative is a keystore file that lives on somebody's laptop, and losing
it means never updating the Play listing again — the app has to be
republished under a new package name, and every existing install is
orphaned. EAS holds it, and `eas credentials` can export a backup, which
should be done once and stored wherever this project keeps
`SESSION_SECRET`.

**No credential, key or password appears in `eas.json`, `app.config.ts` or
any `EXPO_PUBLIC_` variable.** `docs/SECURITY.md` rule one, unchanged. Build
secrets go in EAS environment variables.

---

## 3. EAS Update — and its hard boundary

Worth taking: SDK 56's Hermes bytecode diffing cut update payloads by ~58%
on average, and being able to fix a copy error without a four-day store
review is the difference between a shop that reads well and one that waits.

The boundary, which must be written where someone will read it before
running the command:

> **An OTA update ships JavaScript and assets. It cannot ship native
> changes.** Adding a dependency with native code, changing a config plugin,
> changing a permission, or upgrading the SDK all require a new binary. The
> fingerprint runtime version is what enforces this; the CI check in §1 is
> what stops it being bypassed by someone in a hurry.

Policy:

- Updates are **JS-only fixes and copy changes**. Not features. A feature
  gets a build.
- Every update is published from a **tagged commit** on `main`, never from a
  working tree.
- `preview` channel first, verified on a device, then `production`.
- **Roll back by republishing the previous update**, not by deleting the bad
  one. `eas update:rollback` exists; know which command is being run before
  an incident, not during.
- The web's copy already changes without a deploy — the four legal pages are
  admin-editable and served through `content-v1.json`. **Most copy fixes
  therefore need no update at all**, which is worth knowing before reaching
  for one.

---

## 4. CI

Extend `.github/workflows/`, keeping the existing three jobs untouched.

```
mobile-check        every PR touching apps/mobile or packages/**
  pnpm install --frozen-lockfile
  pnpm turbo typecheck lint
  pnpm --filter mobile exec expo-doctor
  pnpm --filter mobile exec expo export --platform all      # a real bundle
  pnpm --filter mobile check-size                            # Phase 5 gate

mobile-build        on a tag matching mobile-v*
  eas build --profile production --platform all --non-interactive --wait
  record the artefact size into research/mobile-audits/

mobile-submit       manual dispatch, after a human has installed the build
  eas submit --profile production --platform all
```

**`mobile-submit` is deliberately not automatic.** The Phase 3 gate exists
because a Release-only hang is invisible in development; a pipeline that
submits without anyone launching the binary defeats it. A human installs the
production build, launches it, and then dispatches the job.

`expo export` in `mobile-check` matters more than it looks: it is the only
CI step that would catch a Metro resolution failure introduced by a pnpm
change, and pnpm resolution is exactly the thing this monorepo is most
likely to break.

---

## 5. Store submission

The failures here are not technical, and they are the ones that cost weeks.

### Both stores

- **Privacy declarations must match reality.** Play's Data Safety form and
  Apple's Privacy Nutrition Labels. What is actually collected: name, email,
  phone, delivery address, order history. If Sentry or PostHog are
  configured, crash data and analytics too — **and consent gates them**, as
  it does on the web, so the declaration must describe the consented state
  honestly rather than the maximal one.
- **An account deletion path is required by both stores** where accounts
  exist. This shop has no accounts, which is unusual enough that a reviewer
  may not believe it. The privacy screen already offers export and erasure
  under DPDP; point at it in the review notes and explain in one sentence
  that identity is an order reference plus an email, not a registration.
  Expect a question; have the answer written down.
- **No disease, cure or treatment claims** anywhere in the listing, the
  screenshots or the description. FSSAI, and it is a rule in `AGENTS.md`
  because it is the kind of thing marketing copy does by reflex.
- **No fabricated social proof in the listing.** No invented ratings, no
  "loved by thousands". Rule 5 does not stop at the app's edge.
- **Screenshots must be real screens**, not mockups with prices that were
  never charged.

### Apple specifically

- **Guideline 3.1.1, in-app purchase.** Physical goods delivered in the real
  world are explicitly exempt. Say so in the review notes, plainly, because
  a reviewer who mis-files a food shop as digital content will reject it and
  the appeal costs a week.
- **Sign in with Apple** is required only where third-party sign-in is
  offered. There is no sign-in at all. Again: expect the question.
- A **demo order reference and email** in the review notes, so the reviewer
  can reach the account area. Create a real order for this purpose and
  delete it after — do not fabricate one in the database.

### Google Play specifically

- **`targetSdkVersion` 36**, which SDK 57 already sets. Play enforces a
  floor and rejects below it.
- Payments: physical goods, so Play's billing requirement does not apply.
  Razorpay is correct here.
- The Data Safety form again, and it is compared against what the binary
  actually does.

---

## 6. Monitoring

- **Sentry** (`@sentry/react-native@8.22.0`) if a DSN is configured, and
  **nothing loads without one** — the same inert state the web has. Source
  maps uploaded per build or a stack trace is a list of numbers.
- **PostHog** only behind the same consent gate as the web.
  `docs/SECURITY.md`: *"Consent is the load condition, not a filter."* An
  app that initialises analytics at launch and filters later has already
  broken it.
- `/api/health` already reports instance and rate-limiter state. Add the
  three catalogue documents to whatever uptime check watches the site, since
  the app's ability to browse now depends on them.

---

## 7. The release checklist

Committed as `docs/mobile/release-checklist.md`, run every time.

- [ ] `pnpm turbo typecheck lint` clean
- [ ] Every web suite green
- [ ] `expo-doctor` clean
- [ ] `version` bumped, `versionCode` / `buildNumber` bumped, both in the
      diff
- [ ] Fingerprint compared against the current channel — a native change
      means a new binary, not an update
- [ ] `CHANGELOG` entry written for humans
- [ ] `production` build installed on **physical** Android and iOS hardware
      and launched ten times from cold
- [ ] `docs/mobile/device-checklist.md` run in full, including the TalkBack
      and VoiceOver passes
- [ ] Size measured and recorded in `research/mobile-audits/`; budget held
- [ ] A COD order placed from the release binary against production
- [ ] Store listing, screenshots and privacy declarations reviewed against
      §5
- [ ] Tagged, then submitted

---

## Exit criteria

- [ ] `eas.json` committed with pinned Node, per-profile channels, AAB for
      production
- [ ] Fingerprint runtime policy in place, with the CI check that refuses a
      mismatched update **demonstrated failing**
- [ ] Keystore and certificates managed by EAS, with an exported backup
      stored where the project's other secrets live
- [ ] `mobile-check` running on every relevant PR
- [ ] One full rehearsal: build → install → checklist → submit to internal
      testing on Play and TestFlight on Apple
- [ ] One OTA update published to `preview`, verified on a device, and
      rolled back — **rehearsed before it is needed**
- [ ] `docs/mobile/release-checklist.md` and `device-checklist.md` committed
- [ ] `docs/deploy.md` updated to cover the app, so there is one document
      that answers "how does this ship"

---

## Related

[Programme index](README.md) · [← Phase 5](phase-5-size-and-performance.md) ·
[`docs/deploy.md`](../deploy.md) · [`docs/SECURITY.md`](../SECURITY.md) ·
[`research/mobile-stack-research.md` §6](../../research/mobile-stack-research.md)
