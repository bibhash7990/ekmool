import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Edges } from "react-native-safe-area-context";

import { color, space } from "@/theme";

/**
 * The web's `max-w-[1180px]`, translated.
 *
 * A phone is narrower than 1180pt so the cap almost never binds, and it is
 * still not vestigial: Android runs on foldables that open to around 700pt,
 * and at that width a paragraph runs edge to edge and the page reads cheap —
 * which is exactly why the web narrows long-form pages to 720px. 640pt keeps
 * the measure near the 52-68ch the design system asks for. One style, right
 * on the one device where it matters.
 */
const MAX_CONTENT_WIDTH = 640;

/**
 * Edges for a screen that sits under the root Stack's native header.
 *
 * The header has already consumed the top inset by the time the screen's
 * content area starts, so asking for `top` here adds a second gap under the
 * title. The default below keeps `top` because the alternative failure is
 * worse: a headerless screen (the four tab roots) without a top inset draws
 * its first element under the status bar on edge-to-edge Android, and a
 * cosmetic gap beats clipped content.
 */
export const edgesUnderHeader: Edges = ["left", "right", "bottom"];

const defaultEdges: Edges = ["top", "left", "right", "bottom"];

export type ScreenProps = {
  children: ReactNode;
  /** Wrap the content in a ScrollView. Off by default — a list screen brings
   *  its own scroller and nesting two is a known way to lose a scroll. */
  scroll?: boolean;
  /** Horizontal gutter. Turn it off for a full-bleed list or image. */
  gutter?: boolean;
  /** Pass `edgesUnderHeader` on any screen the root Stack gives a header. */
  edges?: Edges;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The page container — the phone's answer to
 * `mx-auto max-w-[1180px] px-5 lg:px-8`.
 *
 * Three jobs and only three: paint the paper ground, keep content out from
 * under the system bars, and hold the gutter. Everything else a screen needs,
 * it composes itself.
 */
export function Screen({
  children,
  scroll = false,
  gutter = true,
  edges = defaultEdges,
  style,
  contentStyle,
  testID,
}: ScreenProps) {
  const content = (
    <View
      style={[styles.column, gutter ? styles.gutter : null, contentStyle]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.ground, style]} testID={testID}>
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.grow}
          // A tap on a button while the keyboard is open should press the
          // button, not just dismiss the keyboard and make the customer tap
          // twice. This is the default on the web and not here.
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  ground: {
    flex: 1,
    backgroundColor: color.paper,
  },
  fill: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  column: {
    // flexGrow rather than flex, so the same style works inside a ScrollView
    // content container (where flex: 1 would pin the content to the viewport
    // height and stop it scrolling) and inside the plain View branch.
    flexGrow: 1,
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
  },
  gutter: {
    paddingHorizontal: space.x5,
  },
});
