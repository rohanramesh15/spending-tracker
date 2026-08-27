import type { TransactionListItem } from "@shared/api/types";
import { TransactionRow } from "@/components/TransactionRow";
import { BlockGroup } from "@/components/ui";

/**
 * A group of transactions rendered as one grouped block.
 *
 * A thin binding of transaction data onto ui/BlockGroup, which owns the surface, corners and
 * separators for every grouped list in the app (Settings uses the same container). Callers
 * decide only *behaviour* — what a tap does, whether rows have a menu.
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
    <BlockGroup testID={testID}>
      {items.map((t) => (
        <TransactionRow
          key={t.id}
          transaction={t}
          onPress={onPressItem ? () => onPressItem(t) : undefined}
          onLongPress={onOpenMenu ? () => onOpenMenu(t) : undefined}
          onOpenMenu={onOpenMenu ? () => onOpenMenu(t) : undefined}
        />
      ))}
    </BlockGroup>
  );
}
