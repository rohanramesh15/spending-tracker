import { Paragraph, XStack } from "tamagui";

import { categoryColor, categoryInk, categoryLabel, isHatched } from "@shared/lib/categories";

/**
 * Category pill. Ported from the web CategoryChips.
 *
 * The colors come from shared/lib/categories.ts and are NOT re-picked here: that palette was
 * validated for contrast and color-vision deficiency (fill ≥3:1, chip text ≥4.5:1), so the
 * fill/ink split must be preserved rather than approximated with a tint.
 *
 * Tip and Uncategorized share a hue with Tax and Other respectively and are distinguished by
 * hatching in the chart. A chip can't hatch legibly at this size, so it leans on its text
 * label — which is always present here, unlike a pie slice.
 */
export function CategoryChip({ name, testID }: { name: string; testID?: string }) {
  const label = categoryLabel(name);

  return (
    <XStack
      backgroundColor={categoryColor(name)}
      borderRadius="$10"
      paddingHorizontal="$2.5"
      paddingVertical="$1"
      alignItems="center"
      opacity={isHatched(name) ? 0.85 : 1}
      testID={testID ?? `category-chip-${name}`}
      accessibilityLabel={label}
    >
      <Paragraph size="$1" fontWeight="600" color={categoryInk(name)}>
        {label}
      </Paragraph>
    </XStack>
  );
}
