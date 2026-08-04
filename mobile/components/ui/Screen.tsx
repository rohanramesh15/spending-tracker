import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, YStack } from "tamagui";

import { SCREEN_BACKGROUND, SCREEN_PADDING_X } from "./grouped";

/**
 * Standard screen frame: safe-area insets, consistent padding, optional scrolling.
 *
 * Replaces the web AppShell's `<main className="... px-4 pb-24 pt-4">`. The bottom padding
 * there existed to clear a fixed nav bar; on native the tab bar is laid out by the navigator,
 * so it isn't needed and the content can use the full height.
 */
export function Screen({
  children,
  scrollable = true,
  padded = true,
  testID,
  onBackgroundPress,
  collapsingHeader,
  scrollViewTestID,
}: {
  children: ReactNode;
  scrollable?: boolean;
  padded?: boolean;
  testID?: string;
  /**
   * Called when the user taps the screen away from any interactive element — the native
   * equivalent of clicking off a popover. Used to dismiss a transient selection (e.g. the
   * spending pie's selected slice). Child pressables still win the touch, so this only fires
   * for taps that would otherwise do nothing.
   */
  onBackgroundPress?: () => void;
  /**
   * Content pinned above the scroll area that slides away as the user scrolls DOWN into the
   * list, and returns as soon as they scroll back UP.
   *
   * Driven by `Animated.diffClamp` on the scroll offset rather than by a hide/show flag. A flag
   * has to decide, from deltas, which state it is in — and when it guesses wrong (a momentum
   * frame, a bounce, a layout that changes height after the first measurement) it latches and
   * the header stays stuck part-way, which is exactly what happened here. diffClamp derives the
   * offset from the scroll position every frame, so there is no state to get stuck: it is
   * self-correcting by construction, and it tracks the finger instead of snapping.
   */
  collapsingHeader?: ReactNode;
  /** Addresses the scroll view itself, for tests that drive scrolling. */
  scrollViewTestID?: string;
}) {
  const padding = padded ? "$4" : 0;
  // Resolved rather than passed as a token: SafeAreaView is a plain RN view and takes a style.
  const theme = useTheme();
  const pageBackground = theme[SCREEN_BACKGROUND.replace("$", "")]?.val as string | undefined;

  const [headerHeight, setHeaderHeight] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;

  function onHeaderLayout(e: LayoutChangeEvent) {
    const next = Math.round(e.nativeEvent.layout.height);
    // Re-measured whenever it changes: the search field and title settle to their real height
    // after the first frame, and translating by a stale height leaves the header half-hidden.
    if (next > 0 && next !== headerHeight) setHeaderHeight(next);
  }

  /*
   * Memoised on the measured height, and that is load-bearing.
   *
   * `Animated.diffClamp` accumulates — it tracks how far the value has moved since it was
   * created. Building it during render made a fresh node every frame, so the accumulated
   * distance reset constantly and the header never moved; it looked permanently pinned. It has
   * to be created once per height, not once per render.
   *
   * Clamped to [0, headerHeight] so the header can never travel further than its own height,
   * and `1` while unmeasured because diffClamp needs a non-zero range.
   */
  const headerY = useMemo(() => {
    const span = headerHeight || 1;

    /*
     * Negative offsets are clamped away BEFORE diffClamp sees them.
     *
     * iOS rubber-bands past the top, driving contentOffset.y negative. diffClamp measures
     * distance travelled, so a bounce feeds it real movement in both directions and its window
     * drifts — the header crept upward a little on every pull-to-bounce and never came back.
     * Feeding it a floor of 0 means the top of the list is a hard reference point.
     */
    const downwardOnly = scrollY.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolateLeft: "clamp",
    });

    return Animated.diffClamp(downwardOnly, 0, span).interpolate({
      inputRange: [0, span],
      outputRange: [0, -span],
      extrapolate: "clamp",
    });
  }, [headerHeight, scrollY]);

  // One wrapper carrying the gap, so the pressable and non-pressable paths lay out identically.
  const body = onBackgroundPress ? (
    <YStack gap="$4" onPress={onBackgroundPress} testID="screen-background">
      {children}
    </YStack>
  ) : (
    children
  );

  return (
    <SafeAreaView
      // Clips the header as its negative margin carries it up past the top edge, so it slides
      // away instead of continuing on over the status bar.
      style={{ flex: 1, backgroundColor: pageBackground, overflow: "hidden" }}
      edges={["top"]}
      testID={testID}
    >
      {collapsingHeader ? (
        /*
         * A NORMAL flex child with an animated negative top margin — deliberately not absolutely
         * positioned.
         *
         * Three separate bugs came from the absolute version, all of them coordinate arithmetic:
         * absolute children are not laid out against SafeAreaView's padded box, so the header
         * either sat under the status bar or, once compensated, left an empty band the height of
         * the notch; and the list needed a matching paddingTop that had to be kept in sync by
         * hand.
         *
         * As a flex sibling there is no arithmetic at all: the layout is correct by construction at
         * every point in between, and the parent's overflow clips the header as it goes.
         *
         * Both the header AND the scroll view are translated, by the same value, so the list
         * follows the header up rather than leaving a blank band where it was. Transform, not
         * marginTop — the native animated module rejects layout properties outright ("Style
         * property 'marginTop' is not supported"), and a transform runs on the native thread.
         */
        <Animated.View
          onLayout={onHeaderLayout}
          style={{ transform: [{ translateY: headerY }] }}
        >
          <YStack
            paddingHorizontal={padded ? SCREEN_PADDING_X : 0}
            paddingTop={padded ? SCREEN_PADDING_X : 0}
            testID="collapsing-header"
          >
            {collapsingHeader}
          </YStack>
        </Animated.View>
      ) : null}

      {scrollable ? (
        // Animated.ScrollView, not Tamagui's: a native-driven Animated.event only attaches to an
        // Animated component. On a plain ScrollView the handler is silently ignored and the
        // header never moves — which is exactly what happened.
        <Animated.ScrollView
          style={
            collapsingHeader
              ? {
                  transform: [{ translateY: headerY }],
                  // Translating up by H would leave H of empty space at the bottom; growing the
                  // view by the same amount keeps it filling the screen. Static, not animated.
                  marginBottom: -headerHeight,
                }
              : undefined
          }
          contentContainerStyle={{
            padding: padded ? SCREEN_PADDING_X : 0,
            // The header is a sibling above the list, not an overlay, so the list needs no
            // top padding of its own when one is present.
            paddingTop: collapsingHeader ? 0 : padded ? SCREEN_PADDING_X : 0,
            gap: onBackgroundPress ? 0 : 16,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
          onScroll={
            collapsingHeader
              ? Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                  useNativeDriver: true,
                })
              : undefined
          }
          scrollEventThrottle={16}
          testID={scrollViewTestID}
        >
          {body}
        </Animated.ScrollView>
      ) : (
        <YStack flex={1} padding={padding} gap="$4">
          {body}
        </YStack>
      )}
    </SafeAreaView>
  );
}
