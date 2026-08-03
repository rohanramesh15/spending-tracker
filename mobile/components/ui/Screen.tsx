import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, YStack } from "tamagui";

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
}: {
  children: ReactNode;
  scrollable?: boolean;
  padded?: boolean;
  testID?: string;
}) {
  const padding = padded ? "$4" : 0;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]} testID={testID}>
      {scrollable ? (
        <ScrollView
          contentContainerStyle={{ padding: padded ? 16 : 0, gap: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <YStack flex={1} padding={padding} gap="$4">
          {children}
        </YStack>
      )}
    </SafeAreaView>
  );
}
