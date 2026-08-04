import Feather from "@expo/vector-icons/Feather";
import { Paragraph, XStack, YStack } from "tamagui";

import type { TransactionListItem } from "@shared/api/types";
import { categoryLabel } from "@shared/lib/categories";
import { formatCents } from "@shared/lib/money";
import { BLOCK_PADDING_X } from "@/components/ui";

/**
 * One transaction in a list. Ported from the web TransactionRow.
 *
 * Deliberately reduced to vendor / categories / amount. The date and item count were dropped
 * from the row: in the Transactions list the date is already the day-group heading directly
 * above, so repeating it on every row was noise.
 *
 * NOTE for whoever adds the next list: this row no longer carries a date at all, so any list
 * that is not grouped by day must supply that context itself. See app/(tabs)/index.tsx.
 *
 * It does NOT style its own surface — background, corners and separators belong to
 * ui/BlockGroup, which is what keeps every grouped list in the app identical.
 *
 * The row actions are reachable two ways on purpose. Long-press is the iOS idiom, but it is
 * invisible — nothing on screen tells you it exists, so Edit/Hide/Delete were effectively
 * unreachable for anyone who didn't guess the gesture. The `⋮` button restores the web row's
 * discoverable affordance without taking the native gesture away. Both call `onOpenMenu`.
 */
export function TransactionRow({
  transaction,
  onPress,
  onLongPress,
  onOpenMenu,
}: {
  transaction: TransactionListItem;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Omit to render no actions button — the Home screen's recent list has no row menu. */
  onOpenMenu?: () => void;
}) {
  const { vendor, categories, total_cents, currency } = transaction;

  return (
    <XStack
      alignItems="center"
      gap="$3"
      paddingVertical="$3"
      paddingHorizontal={BLOCK_PADDING_X}
      pressStyle={{ opacity: 0.6 }}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      testID={`transaction-row-${transaction.id}`}
    >
      <YStack flex={1} gap="$1">
        <Paragraph fontWeight="600" numberOfLines={1}>
          {vendor}
        </Paragraph>
        {/* Plain text rather than coloured pills: at three-per-row the pills competed with the
            vendor and the amount. The category is supporting information here — the pie is where
            colour carries meaning. Capped at 3 so a busy receipt can't overrun the row. */}
        {categories.length > 0 ? (
          <Paragraph size="$2" theme="alt2" numberOfLines={1}>
            {categories.slice(0, 3).map(categoryLabel).join(" · ")}
          </Paragraph>
        ) : null}
      </YStack>

      {/* Amount and menu are one unit, tightly spaced, so the price reads as belonging to the
          row's right edge rather than floating between the categories and the ⋮. */}
      <XStack alignItems="center" gap="$1">
        <Paragraph fontWeight="600">{formatCents(total_cents, currency)}</Paragraph>

        {onOpenMenu ? (
          <XStack
            // Its own pressable, so tapping it opens the menu instead of navigating to the
            // detail screen. Padding rather than a bare icon: 18px is well under the 44pt
            // minimum touch target, and this sits right next to the row's own tap area.
            // No right padding: the row already provides 13px, and adding more here pushed
            // the icon ~2px deeper than the vendor text is inset on the left, so the block
            // looked lopsided. hitSlop keeps the touch target comfortable without the padding.
            paddingVertical="$2"
            paddingLeft="$1"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}
            pressStyle={{ opacity: 0.5 }}
            onPress={onOpenMenu}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${vendor}`}
            testID={`transaction-actions-${transaction.id}`}
          >
            <Feather name="more-vertical" size={18} color="#8a8a8e" />
          </XStack>
        ) : null}
      </XStack>
    </XStack>
  );
}
