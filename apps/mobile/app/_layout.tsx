import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { Provider } from "react-redux";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { store } from "@/store";
import { color, font, type as typeScale } from "@/theme";

/**
 * The root layout — and **the only Stack in the application**.
 *
 * Every detail screen (product, cart, order, content) pushes onto this one.
 * The tab group below it is four screens with no navigator of their own.
 * That is the architecture, and it is not a preference:
 *
 *  1. **expo/expo#47687.** On iOS **Release builds only**, expo-router with a
 *     Tabs layout where each tab hosts its own nested Stack hangs forever on
 *     the native splash — the navigator's first Fabric commit never
 *     completes. Debug builds never reproduce it, which is the worst
 *     possible property for a defect to have: it ships. The reported fix is
 *     to flatten the tabs, and it took a production app from 0/10 to 10/10
 *     cold launches.
 *  2. It is faster regardless. One native stack is one set of view
 *     controllers, one back-gesture owner, and fewer retained screens than
 *     four parallel histories.
 *
 * The cost, stated so nobody rediscovers it as a bug: pushing a product from
 * Search and then switching to Shop loses the product's place in Search.
 * With five products that is not a loss anyone will feel.
 *
 * scripts/check-mobile.mjs fails the build if a second Stack appears under
 * app/(tabs)/, with this issue linked in the message.
 */

// Hold the native splash until the first screen is ready to draw. Without
// this there is a frame of blank window between the splash tearing down and
// React committing — on a mid-range Android phone it reads as a flicker.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // Fonts are embedded by the expo-font config plugin rather than fetched
    // by useFonts at runtime, so there is nothing to await here — the splash
    // can go as soon as the tree has mounted once. Embedding is what avoids
    // a first-frame flash of the system font, which on a brand whose whole
    // argument is typographic is worth a config plugin.
    void SplashScreen.hideAsync();
  }, []);

  return (
    <Provider store={store}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.paper }}>
        <SafeAreaProvider>
          {/*
            Dark content on a light ground: there is one field and it is
            paper. There is deliberately no `backgroundColor` — SDK 57
            removed the prop, because Android is now edge-to-edge
            unconditionally and the app draws *through* the status bar
            rather than behind a bar it owns. The paper comes from
            GestureHandlerRootView above, which is what the system now
            composites against.
          */}
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: color.paper },
              headerTintColor: color.green900,
              headerTitleStyle: {
                // font.display, not the literal "Marcellus". React Native
                // resolves a face by file base name on Android and by
                // PostScript name on iOS, and the *family* name matches
                // neither — it fails silently to the system font, which is
                // the one failure a screenshot catches and a test does not.
                fontFamily: font.display,
                fontSize: typeScale.t20.fontSize,
                color: color.green900,
              },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: color.paper },
              // The platform's own transition, untouched. Screen animation in
              // JavaScript costs a worklet per frame to reproduce something
              // the OS already does on the compositor.
              animation: "default",
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="product/[slug]" options={{ title: "" }} />
            <Stack.Screen name="cart" options={{ title: "Basket" }} />
            <Stack.Screen name="content/[key]" options={{ title: "" }} />
            <Stack.Screen name="+not-found" options={{ title: "Not found" }} />
          </Stack>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Provider>
  );
}
