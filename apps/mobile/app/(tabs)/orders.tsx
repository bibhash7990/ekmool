import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Eyebrow, Screen, SoilLine } from "@/components/ui";
import { color, font, space, type as typeScale } from "@/theme";

/**
 * Orders — an empty state, and only an empty state, in this phase.
 *
 * The honest version of this screen is the difficult one to write, because
 * the comfortable copy ("Your orders will appear here") implies the app can
 * take an order, and it cannot: there is no checkout in this phase and no
 * order lookup either. Saying so plainly, and saying where orders placed on
 * the site can be found in the meantime, is the design system's rule that a
 * refusal names the reason.
 *
 * There is deliberately no "sign in" prompt. There is no registration on
 * this shop and there must never be one (rule 7); orders are found by order
 * number and email, which is what the lookup in the next phase will do.
 */
export default function OrdersScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Your orders</Eyebrow>
        <Text accessibilityRole="header" style={styles.h1}>
          Nothing to show yet.
        </Text>

        <SoilLine />

        <Text style={styles.body}>
          This version of the app browses the shelf and keeps a basket. It
          cannot take an order yet — checkout arrives in the next release, and
          this is where the orders you place will be listed.
        </Text>
        <Text style={styles.body}>
          An order placed on ekmool.in can be followed today from the tracking
          link in its confirmation email, or by looking it up on the site with
          the order number and the email address you used. There is no account
          to create, here or there.
        </Text>

        <View style={styles.aside}>
          <Text style={styles.asideText}>
            Nothing you put in the basket is sent anywhere. It stays on this
            phone until there is a checkout to send it to.
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
