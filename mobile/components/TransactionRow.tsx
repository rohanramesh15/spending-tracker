import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { Paragraph, XStack, YStack } from "tamagui";

import type { TransactionListItem } from "@shared/api/types";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";
import { CategoryChip } from "@/components/CategoryChip";

/**
 * One transaction in a list. Ported from the web TransactionRow.
 *
 * `parseISODate` is used rather than `new Date(iso)`: purchased_on is a LOCAL calendar date,
 * and parsing it as UTC renders the previous day in behind-UTC timezones (CLAUDE.md #2).
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
  const { vendor, purchased_on, item_count, categories, total_cents, currency } = transaction;

  return (
    <XStack
      alignItems="center"
      gap="$3"
      paddingVertical="$3"
      paddingHorizontal="$1"
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
        <Paragraph size="$2" theme="alt2">
          {format(parseISODate(purchased_on), "MMM d")} ·{" "}
          {item_count > 0 ? `${item_count} item${item_count === 1 ? "" : "s"}` : "Not itemized"}
        </Paragraph>
        {categories.length > 0 ? (
          <XStack flexWrap="wrap" gap="$1.5" paddingTop="$1">
            {categories.slice(0, 3).map((c) => (
              <CategoryChip key={c} name={c} />
            ))}
          </XStack>
        ) : null}
      </YStack>

      <Paragraph fontWeight="600">{formatCents(total_cents, currency)}</Paragraph>

      {onOpenMenu ? (
        <XStack
          // Its own pressable, so tapping it opens the menu instead of navigating to the
          // detail screen. Padding rather than a bare icon: 18px is well under the 44pt
          // minimum touch target, and this sits right next to the row's own tap area.
          paddingVertical="$2"
          paddingLeft="$2"
          paddingRight="$1"
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
  );
}
