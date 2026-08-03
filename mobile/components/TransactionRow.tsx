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
 */
export function TransactionRow({
  transaction,
  onPress,
  onLongPress,
}: {
  transaction: TransactionListItem;
  onPress?: () => void;
  onLongPress?: () => void;
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
    </XStack>
  );
}
