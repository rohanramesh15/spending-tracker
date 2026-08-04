import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, useTheme, YStack } from "tamagui";

import { SCREEN_BACKGROUND } from "./grouped";

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
}) {
  const padding = padded ? "$4" : 0;
  // Resolved rather than passed as a token: SafeAreaView is a plain RN view and takes a style.
  const theme = useTheme();
  const pageBackground = theme[SCREEN_BACKGROUND.replace("$", "")]?.val as string | undefined;

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
      style={{ flex: 1, backgroundColor: pageBackground }}
      edges={["top"]}
      testID={testID}
    >
      {scrollable ? (
        <ScrollView
          contentContainerStyle={{
            padding: padded ? 16 : 0,
            gap: onBackgroundPress ? 0 : 16,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        <YStack flex={1} padding={padding} gap="$4">
          {body}
        </YStack>
      )}
    </SafeAreaView>
  );
}
