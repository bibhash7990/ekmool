/**
 * A config file rather than app.json, because JSON cannot carry a reason.
 * Nearly every field below is a decision with an alternative that was
 * rejected, and the plan's original justification — that this file had to
 * read `process.env` — no longer holds: the project id is checked in (see
 * `extra.eas` at the foot of the file) and the API origin moved to
 * `eas.json`, because eas-cli reads neither `.env` files nor this process's
 * environment. What is left is the comments, and they are enough.
 *
 * **JavaScript rather than TypeScript, and that is a workaround with a date
 * on it.** `eas-cli` cannot parse an `app.config.ts` at all right now:
 *
 *     @expo/require-utils@55.0.6  build/load.js:179
 *         const ts = loadTypescript();          // bare require('typescript')
 *         if (ts) {                             // truthy
 *           module = ts.ModuleKind.CommonJS;    // TypeError
 *
 * `loadTypescript()` resolves `typescript` from the CLI's own tree, not this
 * project's. Installed with npx, that tree gets TypeScript **7** — the Go
 * port, whose `require('typescript')` entry point exports only `{ version,
 * versionMajorMinor }`. The compiler API is gone, so `ts.ModuleKind` is
 * undefined and the `if (ts)` guard sails straight past it. The result is
 * `Cannot read properties of undefined (reading 'CommonJS')` on every
 * `eas init` and `eas build`.
 *
 * Nothing here is at fault: the project's own Expo CLI reads a `.ts` config
 * fine, and so does `expo export`. Only `eas-cli` breaks, and only because
 * npm hoists TypeScript 7 into it — `@expo/require-utils` asks for `^5.0.0`
 * and `ts-node`'s looser `>=2.7` peer wins the hoist.
 *
 * Verified rather than assumed, by loading both forms through the broken
 * CLI's own loader: `.ts` throws, this file loads and reads `process.env`.
 *
 * The alternative — keeping `.ts` and installing TypeScript 5 next to
 * `eas-cli` — also works and was tested (5.9.3, loads fine). It was rejected
 * because it has to be remembered on every machine, by every person, and in
 * CI, and it is silent when forgotten. This file cannot be forgotten.
 *
 * **Revert to `.ts` when `@expo/require-utils` guards on `ts.ModuleKind`
 * rather than on `ts`.** The type checking is not lost meanwhile: the JSDoc
 * annotation below is checked by `tsc --noEmit` via `checkJs` in
 * tsconfig.json, which is what caught `newArchEnabled` and
 * `edgeToEdgeEnabled` being removed in SDK 57.
 *
 * Nothing secret goes in here. `extra` and every EXPO_PUBLIC_* variable are
 * compiled into the bundle and can be read out of the APK with a zip tool;
 * `docs/SECURITY.md`'s rule for NEXT_PUBLIC_* carries over word for word.
 * The Razorpay key id is publishable and may live here when Phase 4 needs
 * it. The key secret may not, ever.
 *
 * @type {() => import("expo/config").ExpoConfig}
 */
module.exports = () => ({
  name: "Ekmool",

  // The EAS account that owns the project. Required because the project
  // lives under a team rather than a personal account, and `eas init` cannot
  // write it here itself — a dynamic config is code, so the CLI prints the
  // field and stops rather than rewriting a file it cannot safely parse.
  //
  // Not a secret. It is the account name in every expo.dev URL for this app.
  owner: "bibhashs-team",

  // **Changing this after a project exists is not a rename.** EAS fixes a
  // project's slug when the project is created and the dashboard's rename
  // does not move it, so a mismatch between this line and the project behind
  // `extra.eas.projectId` fails every command with "Slug for project
  // identified by ... does not match". Verified the hard way against a
  // project first created as `ekmoool`: renaming on expo.dev left the server
  // slug where it was, and a new project was the only way out.
  //
  // It is worth the trouble rather than editing this line to match, because
  // the slug is what expo.dev URLs and update manifests are built from.
  slug: "ekmool",

  scheme: "ekmool",

  // D9: the version lives here, in the diff, where a reviewer sees it change.
  // EAS `appVersionSource: local` reads it rather than keeping its own copy
  // on a server the repository cannot see.
  //
  // `version` is what a customer sees in the store. The two build numbers
  // below are what the stores order releases by, and they are separate
  // because Apple and Google count differently — Google takes an integer,
  // Apple takes a string.
  //
  // **Bump the build number in the same commit as the change it ships.**
  // There is deliberately no `autoIncrement` in eas.json: it cannot write
  // back into a dynamic config, so it would either fail the build or
  // silently leave the number where it was. Manual is the honest option
  // here, and it is what D9 asked for — a version a reviewer sees change.
  //
  // The number is load-bearing beyond the store listing. src/lib/client-info.ts
  // sends it as `X-Ekmool-Client: mobile/1.0.0 (android; build 1)`, and the
  // server's `minClientBuild` compares against it. A build of 0 — which is
  // what a missing value here produces — fails every comparison, which is
  // the documented safe direction but would wall off every install.
  version: "1.0.0",

  orientation: "portrait",

  // One field, and it is paper. The design system has no dark palette: it
  // has cream, and exactly one dark band per page. Inventing eleven dark
  // tokens without the design intent behind them would break the contrast
  // floor in ways nobody would catch until an accessibility audit. If dark
  // mode is wanted it is a design exercise first and a code change second.
  userInterfaceStyle: "light",

  // No `newArchEnabled`. The plan's sketch carried it; SDK 57 removed the
  // key because the legacy architecture was removed in SDK 55 and there is
  // nothing left to toggle. Bridgeless New Architecture is the only one
  // there is, so the flag is not merely redundant — it fails typecheck.

  // Paper, not white, and set here as well as in the app so the very first
  // frame — before React has mounted anything — is already the brand's
  // ground rather than a white flash. The literal is unavoidable at this
  // one layer: this file is read by the Expo CLI at build time, outside the
  // bundler, so it cannot import @ekmool/tokens. It is checked against the
  // token by scripts/check-mobile.mjs instead.
  backgroundColor: "#FAF7F0",

  icon: "./assets/icon.png",

  android: {
    package: "in.ekmool.app",
    versionCode: 1,
    // No `edgeToEdgeEnabled`. The plan's sketch carried it and SDK 57 has
    // removed the key entirely — edge-to-edge is now unconditional on
    // Android, so the flag would be a no-op that fails typecheck. The
    // consequence is real and is handled rather than opted out of: the app
    // draws under the status and navigation bars, so every screen takes its
    // insets from `Screen`'s SafeAreaView rather than assuming a system bar
    // has reserved the space.
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#FAF7F0",
    },
  },

  ios: {
    bundleIdentifier: "in.ekmool.app",
    buildNumber: "1",
    // A real decision, not an oversight. A tablet layout is a second design
    // system, and the target user in docs/PERFORMANCE.md is "on a mid-range
    // Android phone on a 4G connection in an Indian city". Shipping an
    // unconsidered stretched-phone layout on iPad is worse than shipping
    // none.
    supportsTablet: false,
  },

  plugins: [
    "expo-router",

    // Embedded at build time rather than fetched by `useFonts` at runtime.
    // Runtime loading shows a frame of the system font before the real one
    // arrives, and on a brand whose entire argument is typographic that
    // flash is the first thing a customer sees.
    //
    // Four files, 154 KB: Marcellus at 400 only — the design system is
    // explicit that display hierarchy comes from size, letter-spacing and
    // case, never from synthesised weight — and Figtree at 400/500/600.
    // Do not add a fifth "for headings".
    //
    // These are **static instances**, not the variable Figtree[wght].ttf.
    // The variable file is smaller, and React Native registers it under one
    // family and renders a single default instance, so 500 and 600 would
    // silently come out as 400. Checked before committing to it.
    [
      "expo-font",
      {
        fonts: [
          "./assets/fonts/Marcellus-Regular.ttf",
          "./assets/fonts/Figtree-Regular.ttf",
          "./assets/fonts/Figtree-Medium.ttf",
          "./assets/fonts/Figtree-SemiBold.ttf",
        ],
      },
    ],

    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#FAF7F0",
        image: "./assets/splash-icon.png",
        imageWidth: 160,
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          // R8 plus resource shrinking. EAS turns these on for production
          // builds anyway; stating them here means a local or self-hosted
          // build produces the same artefact as the cloud one, which is the
          // difference between a size number you can trust and one that only
          // holds on somebody else's machine.
          //
          // R8 *full* mode is deliberately absent. It breaks
          // reflection-based libraries, and it belongs in Phase 5 as a
          // measured experiment rather than as a default nobody tested.
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
  },

  extra: {
    eas: {
      // Checked in as a literal, and that is a reversal of the plan, which
      // had it arriving from EAS_PROJECT_ID so it would not be committed.
      //
      // The reason it was env-supplied does not survive contact: eas-cli
      // evaluates this file in its own process and **does not load .env
      // files**. Tested — with the id in .env.local, every command still
      // reports "EAS project not configured. Must configure EAS project by
      // running 'eas init'", which is an error that points at the wrong
      // problem entirely. The only ways to deliver it were an inline
      // variable on every invocation or a shell export, both of which are
      // forgotten silently and fail the same misleading way.
      //
      // Checking it in costs nothing real. It is not a credential: it
      // identifies a project, it is visible at
      // expo.dev/accounts/bibhashs-team/projects/ekmool, and it is embedded
      // in the update manifests every installed app fetches. Compare the
      // GSTIN rule in AGENTS.md — the danger there is a *fabricated* value
      // being taken for real, and there is no fabrication here.
      //
      // The literal is also what makes the slug check above meaningful: the
      // two are compared on every command, and a pair that is checked in
      // together cannot drift apart on one machine only.
      projectId: "1a1e4632-0db5-43bd-a428-523201a891df",
    },
  },
});
