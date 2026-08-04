import { YStack } from "tamagui";

import type { TransactionListItem } from "@shared/api/types";
import { TransactionRow } from "@/components/TransactionRow";
import { BLOCK_SEPARATOR_COLOR, BLOCK_SEPARATOR_WIDTH } from "@/components/ui";

/**
 * A group of transactions rendered as one grouped block.
 *
 * This exists so Home and the Transactions tab cannot drift. Both previously built the same
 * stack by hand — same rows, same separators, same corner arithmetic — which meant a styling
 * change had to be made twice and was silently half-applied when it wasn't. Owning the
 * first/last arithmetic in one place is the point: it is the part that looks broken when it
 * disagrees, and it is invisible in a diff.
 *
 * Callers decide only *behaviour* (what a tap does, whether rows have a menu). Everything
 * visual belongs here and in components/ui/grouped.ts.
 */
export function TransactionList({
  items,
  onPressItem,
  onOpenMenu,
  testID,
}: {
  items: TransactionListItem[];
  onPressItem?: (txn: TransactionListItem) => void;
  /** Omit for a read-only list — Home's recent list has no row actions. */
  onOpenMenu?: (txn: TransactionListItem) => void;
  testID?: string;
}) {
  if (items.length === 0) return null;

  return (
    <YStack testID={testID}>
      {items.map((t, i) => (
        <YStack key={t.id} opacity={t.hidden ? 0.5 : 1}>
          {/* Page-coloured, so it cuts the block rather than drawing a line on it. */}
          {i > 0 ? (
            <YStack
              height={BLOCK_SEPARATOR_WIDTH}
              backgroundColor={BLOCK_SEPARATOR_COLOR}
              testID="block-separator"
            />
          ) : null}
          <TransactionRow
            transaction={t}
            first={i === 0}
            last={i === items.length - 1}
            onPress={onPressItem ? () => onPressItem(t) : undefined}
            onLongPress={onOpenMenu ? () => onOpenMenu(t) : undefined}
            onOpenMenu={onOpenMenu ? () => onOpenMenu(t) : undefined}
          />
        </YStack>
      ))}
    </YStack>
  );
}
