import { format } from "date-fns";
import { YStack } from "tamagui";

import type { TransactionListItem } from "@shared/api/types";
import { parseISODate } from "@shared/lib/dates";
import { TransactionList } from "@/components/TransactionList";
import { BlockGroupTitle } from "@/components/ui";
import { groupByDay } from "@/lib/groupTransactions";

/**
 * Transactions grouped under day headings — the ledger presentation, used by BOTH the
 * Transactions tab and Home's recent list so the two cannot look different.
 *
 * Home previously rendered a flat, dateless list of six. Since the row itself no longer carries
 * a date, that list had no date information anywhere; grouping restores it and makes the two
 * screens one presentation with different inputs.
 *
 * `parseISODate` rather than `new Date(iso)`: purchased_on is a LOCAL calendar date, and parsing
 * it as UTC renders the previous day in behind-UTC timezones (CLAUDE.md #2). This heading is now
 * the only place that date is rendered, so it is where that guard lives.
 */
export function TransactionDayGroups({
  items,
  onPressItem,
  onOpenMenu,
  preserveOrder = false,
  testID,
}: {
  items: TransactionListItem[];
  /** Keep the caller's order — used for search results, which arrive ranked by relevance. */
  preserveOrder?: boolean;
  onPressItem?: (txn: TransactionListItem) => void;
  /** Omit for a read-only list — Home's recent list has no row actions. */
  onOpenMenu?: (txn: TransactionListItem) => void;
  testID?: string;
}) {
  const groups = groupByDay(items, { preserveOrder });
  if (groups.length === 0) return null;

  return (
    <YStack gap="$4" testID={testID}>
      {groups.map(({ day, items: dayItems }) => (
        <YStack key={day} gap="$1.5">
          <BlockGroupTitle>{format(parseISODate(day), "EEEE, MMM d")}</BlockGroupTitle>
          <TransactionList items={dayItems} onPressItem={onPressItem} onOpenMenu={onOpenMenu} />
        </YStack>
      ))}
    </YStack>
  );
}
