import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { Button, Eyebrow, Screen, SoilLine } from "@/components/ui";
import { color, font, space, type as typeScale } from "@/theme";

/**
 * Reached by a deep link (`ekmool://…`) or a universal link that names a
 * route this build does not have — an old campaign URL, a typo, or a link
 * from a newer version of the site.
 *
 * The web's 404 copy, unchanged, because it is the same shop saying the
 * same thing. What differs is the way out: `router.replace`, not push, so
 * the missing route does not stay in the stack for the back gesture to
 * return to.
 */
export default function NotFoundScreen() {
  const browse = useCallback(() => {
    router.replace("/");
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  return (
    <Screen>
      <View style={styles.content}>
        <Eyebrow>Not found</Eyebrow>
        <Text accessibilityRole="header" style={styles.h1}>
          This row was never planted.
        </Text>
        <Text style={styles.body}>
          The page you asked for does not exist here — it may have moved, or
          the link may have a typo. The five origins are all still where you
          left them.
        </Text>

        <SoilLine />

        <View style={styles.actions}>
          <Button onPress={browse}>Browse the shelf</Button>
          <Button variant="secondary" onPress={goBack}>
            Go back
          </Button>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.x5,
    paddingTop: space.x12,
  },
  h1: {
    marginTop: space.x5,
    marginBottom: space.x5,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  body: {
    marginBottom: space.x8,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  actions: {
    marginTop: space.x8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.x4,
  },
});
