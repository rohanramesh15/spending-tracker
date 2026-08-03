import { SafeAreaView } from "react-native-safe-area-context";
import { H1, Paragraph, ScrollView, Separator, Text, XStack, YStack } from "tamagui";

import { categoryColor, categoryLabel } from "@shared/lib/categories";
import { formatRangeLabel, rangePresets } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";

/**
 * Home — PLACEHOLDER (step 2 scaffold). The real screen (spending total, pie chart, recent
 * transactions) is step 6.
 *
 * It deliberately imports from @shared/lib rather than rendering static text: this screen is
 * the smoke test that Metro resolves the out-of-root shared/ directory AND its bare
 * dependencies (date-fns) correctly. If that wiring regresses, this screen breaks loudly
 * instead of the failure surfacing much later.
 *
 * formatCents also exercises Intl under Hermes — see docs/expo-conversion-plan.md §8.1.
 */
export default function HomeScreen() {
  const preset = rangePresets()[0];
  const categories = ["Food and Drinks", "Shopping", "Health", "Uncategorized"];

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <YStack gap="$2">
          <H1 size="$9">TrackIt</H1>
          <Paragraph theme="alt2">Expo scaffold — the real Home screen lands in step 6.</Paragraph>
        </YStack>

        <Separator />

        <YStack gap="$3">
          <Text fontWeight="600">shared/ smoke test</Text>

          <XStack justifyContent="space-between">
            <Paragraph theme="alt2">formatCents(123456)</Paragraph>
            <Paragraph>{formatCents(123456)}</Paragraph>
          </XStack>

          <XStack justifyContent="space-between">
            <Paragraph theme="alt2">Default range</Paragraph>
            <Paragraph>{formatRangeLabel(preset.start, preset.end)}</Paragraph>
          </XStack>

          <YStack gap="$2">
            <Paragraph theme="alt2">Category palette</Paragraph>
            {categories.map((name) => (
              <XStack key={name} alignItems="center" gap="$3">
                <YStack
                  width={16}
                  height={16}
                  borderRadius={4}
                  backgroundColor={categoryColor(name)}
                />
                <Paragraph>{categoryLabel(name)}</Paragraph>
              </XStack>
            ))}
          </YStack>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
