import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { Paragraph, XStack, YStack } from "tamagui";

import type { TransactionListItem } from "@shared/api/types";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";
import { BLOCK_PADDING_X } from "@/components/ui";

/** How much of the row the vendor may occupy before it ellipsizes. */
export const VENDOR_MAX_WIDTH = "62%";

/**
 * One transaction in a list. Ported from the web TransactionRow.
 *
 * Deliberately reduced to vendor / date / amount. The category labels that used to sit under the
 * vendor were, at three-per-row, the widest thing in the list and the least useful — the pie is
 * where category carries meaning. They now appear per line item when the transaction is opened
 * (app/transactions/[id].tsx), which is where that detail belongs, and the date took their line.
 *
 * The date is deliberately short and year-less ("Mar 2"). It repeats the day-group heading above
 * it, which is redundant in a grouped list but is what makes a row readable on its own — and it
 * means a list that is NOT grouped by day still carries its own date.
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
  const { vendor, purchased_on, total_cents, currency, hidden } = transaction;

  // A hidden transaction is excluded from spending but still listed. Lightening its text says
  // "this one doesn't count" at a glance, rather than making the reader remember which is which.
  const ink = hidden ? "$color10" : undefined;

  return (
    <XStack
      alignItems="center"
      // space-between, because the text column no longer eats the leftover width (see its
      // maxWidth) — without this the amount would drift left with it instead of staying pinned
      // to the row's right edge.
      justifyContent="space-between"
      gap="$3"
      paddingVertical="$3"
      paddingHorizontal={BLOCK_PADDING_X}
      pressStyle={{ opacity: 0.6 }}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      testID={`transaction-row-${transaction.id}`}
    >
      {/* Capped rather than free-growing: a long vendor name ran nearly to the amount, so rows
          with long and short names had their prices at wildly different distances from the text.
          Truncating earlier keeps a predictable gutter down the list. */}
      <YStack flex={1} maxWidth={VENDOR_MAX_WIDTH}>
        <Paragraph fontWeight="600" numberOfLines={1} color={ink}>
          {vendor}
        </Paragraph>
        {/* The date takes the line the categories used to occupy. No year: the ledger is read
            in the present, and "Mar 2" is what a receipt-shaped glance needs.
            parseISODate, not new Date(iso) — purchased_on is a LOCAL calendar date and parsing
            it as UTC renders the day before in behind-UTC timezones (CLAUDE.md #2). */}
        <Paragraph size="$2" theme="alt2" numberOfLines={1}>
          {format(parseISODate(purchased_on), "MMM d")}
        </Paragraph>
      </YStack>

      {/* Amount and menu are one unit, tightly spaced, so the price reads as belonging to the
          row's right edge rather than floating between the categories and the ⋮. */}
      <XStack alignItems="center" gap="$1">
        <Paragraph fontWeight="600" color={ink}>
          {formatCents(total_cents, currency)}
        </Paragraph>

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
