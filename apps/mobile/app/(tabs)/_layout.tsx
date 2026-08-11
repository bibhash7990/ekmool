import { NativeTabs } from "expo-router/unstable-native-tabs";

import { color } from "@/theme";

/**
 * Four tabs, four screens, **no navigator inside any of them**.
 *
 * There is deliberately no `<Stack>` in this file or in any tab screen. See
 * app/_layout.tsx for the two reasons (expo/expo#47687, and it being faster
 * anyway); scripts/check-mobile.mjs fails the build if one appears here.
 *
 * `NativeTabs` renders the platform's own tab bar — `UITabBarController` on
 * iOS, the Material bottom bar on Android — rather than a JavaScript
 * reimplementation of one. That buys the platform's behaviours (long-press
 * previews, the iOS 26 minimise-on-scroll) for free, and it is the variant
 * the developers reporting #47687 did not see hang.
 *
 * `unstable-` in the import path is a real warning: the API may move in a
 * minor release. That is a known cost, priced against a documented
 * Release-build hang in the alternative — which is why `expo-router` is
 * pinned exactly in package.json rather than caretted, so a bump is a
 * deliberate act with the §8 launch gate attached to it.
 *
 * Icons are named per platform: SF Symbols on iOS, Android system drawables
 * on Android. Neither name is an asset this app ships, so the four icons
 * below add no bytes of their own.
 *
 * That is not the same as the tab bar being free, and the difference was
 * measured rather than assumed. `expo export --platform android` shows
 * expo-router pulling in `@expo-google-fonts/material-symbols` — a 962 KB
 * TTF — through its `expo-symbols` dependency, whatever icons are named
 * here. It arrives with expo-router itself, so it is not avoidable by
 * choosing different icons, and against a 4.7 MB Hermes bundle it is the
 * single largest asset in the app. Phase 5 owns it; see pending.md.
 */
export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={color.paper}
      tintColor={color.green900}
      labelStyle={{ color: color.green700 }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="bag" drawable="ic_menu_compass" />
        <NativeTabs.Trigger.Label>Shop</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" drawable="ic_menu_search" />
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Icon sf="heart" drawable="ic_menu_save" />
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="orders">
        <NativeTabs.Trigger.Icon sf="shippingbox" drawable="ic_menu_agenda" />
        <NativeTabs.Trigger.Label>Orders</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
