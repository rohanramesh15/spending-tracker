import { Paragraph, XStack } from "tamagui";

import { categoryInk, categoryLabel, categoryTint } from "@shared/lib/categories";

/**
 * Category pill: the category's dark ink on a very light wash of the same hue.
 *
 * Both values come from shared/lib/categories.ts and are NOT re-picked here — the chip and its
 * pie slice derive from one hue by construction, so they can never drift apart. The ink/tint
 * pairing is contrast-tested there (WCAG AA) rather than eyeballed.
 *
 * A solid fill was previously used, which made a row of chips compete with the vendor and
 * amount for attention. The tint keeps the category identifiable while letting the row lead.
 *
 * Tip and Uncategorized share a hue with Tax and Other respectively and are distinguished by
 * hatching in the chart. A chip can't hatch legibly at this size, so it leans on its text
 * label — which is always present here, unlike a pie slice.
 */
export function CategoryChip({ name, testID }: { name: string; testID?: string }) {
  const label = categoryLabel(name);

  return (
    <XStack
      backgroundColor={categoryTint(name)}
      borderRadius="$10"
      paddingHorizontal="$2.5"
      paddingVertical="$1"
      alignItems="center"
      testID={testID ?? `category-chip-${name}`}
      accessibilityLabel={label}
    >
      <Paragraph size="$1" fontWeight="600" color={categoryInk(name)}>
        {label}
      </Paragraph>
    </XStack>
  );
}
