import { SafeAreaView } from "react-native-safe-area-context";
import { H2, Paragraph, YStack } from "tamagui";

/**
 * Temporary stand-in for a screen that hasn't been ported yet. Names the step that will
 * replace it so an unfinished screen is self-documenting rather than a mystery.
 * Delete this component once every screen is ported.
 */
export function ScreenPlaceholder({ title, step }: { title: string; step: string }) {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <YStack flex={1} padding="$4" gap="$2">
        <H2>{title}</H2>
        <Paragraph theme="alt2">Not ported yet — {step}.</Paragraph>
      </YStack>
    </SafeAreaView>
  );
}
