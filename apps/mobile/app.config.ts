import type { ExpoConfig } from "expo/config";

/**
 * TypeScript rather than app.json, because the config has to read the
 * environment — the API origin and the EAS project id are per-deployment and
 * must not be checked in.
 *
 * Nothing secret goes in here. `extra` and every EXPO_PUBLIC_* variable are
 * compiled into the bundle and can be read out of the APK with a zip tool;
 * `docs/SECURITY.md`'s rule for NEXT_PUBLIC_* carries over word for word.
 * The Razorpay key id is publishable and may live here when Phase 4 needs
 * it. The key secret may not, ever.
 */
export default (): ExpoConfig => ({
  name: "Ekmool",
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
  // back into a dynamic `app.config.ts`, so it would either fail the build
  // or silently leave the number where it was. Manual is the honest option
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
  // one layer: app.config.ts is read by the Expo CLI at build time, outside
  // the bundler, so it cannot import @ekmool/tokens. It is checked against
  // the token by scripts/check-mobile.mjs instead.
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
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
