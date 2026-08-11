import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Eyebrow, Screen, SoilLine } from "@/components/ui";
import { color, font, space, type as typeScale } from "@/theme";

/**
 * Saved — an empty state, and only an empty state, in this phase.
 *
 * An empty state is copy, not a placeholder. The temptation here is to
 * write "Nothing saved yet" over a grey box and move on; that tells the
 * customer nothing about why the screen is empty or what would fill it.
 * The web's /wishlist says "Nothing is reserved and no price is held —
 * this is a note to yourself, kept where you left it", and the same
 * sentence is true here, so it is the same sentence.
 *
 * What it must NOT do is offer a save control that does not exist. Saving
 * needs somewhere to put the list, and where that is — this phone only, or
 * this phone and the account behind an order lookup — is a Phase 4
 * decision with the account work. Drawing a heart now would be drawing a
 * button whose behaviour has not been decided.
 */
export default function SavedScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Saved for later</Eyebrow>
        <Text accessibilityRole="header" style={styles.h1}>
          Your list.
        </Text>

        <SoilLine />

        <Text style={styles.body}>
          Nothing is saved on this phone, and nothing can be yet — saving
          arrives with the next release of the app, alongside checkout.
        </Text>
        <Text style={styles.body}>
          When it does, a product you save will be listed here with its pack
          sizes and price. Nothing is reserved and no price is held: it is a
          note to yourself, kept where you left it.
        </Text>
        <Text style={styles.body}>
          Anything you have saved on ekmool.in stays there. The two lists are
          separate, because there is no account to join them under.
        </Text>

        <View style={styles.aside}>
          <Text style={styles.asideText}>
            The Shop tab has all five origins, and Search finds them by their
            Indian names.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.x5,
    paddingTop: space.x6,
    paddingBottom: space.x16,
  },
  h1: {
    marginTop: space.x5,
    marginBottom: space.x8,
    fontFamily: font.display,
    ...typeScale.t34,
    color: color.green900,
  },
  body: {
    marginTop: space.x5,
    fontFamily: font.body,
    ...typeScale.t17,
    color: color.green700,
  },
  aside: {
    marginTop: space.x10,
    borderLeftWidth: 2,
    borderLeftColor: color.gold500,
    paddingLeft: space.x4,
  },
  asideText: {
    fontFamily: font.body,
    ...typeScale.t15,
    color: color.green700,
  },
});
