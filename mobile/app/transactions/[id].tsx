import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Paragraph, XStack, YStack } from "tamagui";

import { useTransaction } from "@shared/api/hooks";
import type { LineItem } from "@shared/api/types";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";
import { CategoryChip } from "@/components/CategoryChip";
import {
  BLOCK_PADDING_X,
  BlockGroup,
  BlockGroupTitle,
  Button,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Screen,
} from "@/components/ui";

/**
 * Transaction detail (user-flow §7): read-only header + line items.
 *
 * Built from the same grouped-block vocabulary as every other screen — PageHeader, section
 * headings, BlockGroup — rather than the bordered Cards it used before. Cards were the web
 * idiom; on this screen they made the detail view read as a different app from the list that
 * opens it, which is the exact drift ui/BlockGroup exists to prevent.
 *
 * The layout answers, in order, the three questions someone taps a transaction to ask: what did
 * this cost (the hero), what was in it (the items), and how does it add up (the summary).
 *
 * Mutating actions (edit / hide / delete) deliberately live on the list's action sheet, not
 * here — this screen is for inspecting a purchase, matching the web split.
 */
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: txn, isLoading, isError, refetch } = useTransaction(id);

  // One header for every state, so the back button never disappears while loading or on an
  // error — a screen you can't leave except by gesture is a dead end.
  const header = (
    <PageHeader
      // The vendor IS the title, so it is stated once for the whole screen. Before this the
      // vendor sat in the hero, the amount sat in both the hero and the summary's Total row, and
      // a one-item receipt said "Kroger" and "$42.12" twice each on half a screen of content.
      title={txn?.vendor ?? "Transaction"}
      left={
        <Button
          variant="ghost"
          circular
          icon={<Feather name="arrow-left" size={20} />}
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
      }
    />
  );

  if (isLoading) {
    return (
      <Screen testID="transaction-detail">
        {header}
        <ListSkeleton rows={5} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen testID="transaction-detail">
        {header}
        <ErrorState message="Couldn't load this transaction." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (!txn) {
    return (
      <Screen testID="transaction-detail">
        {header}
        <EmptyState title="Not found" message="This transaction no longer exists." />
      </Screen>
    );
  }

  // Tax and Tip are transaction-level and are their own categories on the chart (CLAUDE.md #8),
  // so they are worth itemising — but only when there is actually something to itemise.
  const hasBreakdown = txn.subtotal_cents != null || txn.tax_cents > 0 || txn.tip_cents > 0;

  const flags = [
    ...(txn.pending ? ["Pending"] : []),
    ...(txn.hidden ? ["Hidden from spending"] : []),
  ];

  return (
    <Screen testID="transaction-detail">
      {header}

      {/*
       * The hero is the amount and nothing else — the one number the screen exists to show, with
       * the date and source under it as context. The vendor is the page title above; the total
       * is NOT repeated in the summary below.
       */}
      <BlockGroup testID="transaction-hero">
        <YStack alignItems="center" gap="$1" paddingVertical="$4" paddingHorizontal={BLOCK_PADDING_X}>
          <Paragraph fontSize={34} lineHeight={40} fontWeight="700">
            {formatCents(txn.total_cents, txn.currency)}
          </Paragraph>
          <Paragraph size="$2" theme="alt2" textAlign="center">
            {/* No year, matching the day headings in the list — see TransactionDayGroups. */}
            {format(parseISODate(txn.purchased_on), "EEEE, MMM d")} · {txn.source}
          </Paragraph>

          {/* Flags as pills rather than more text on the meta line: "pending" and "hidden from
              spending" change what the number MEANS, so they shouldn't read as trailing detail. */}
          {flags.length > 0 ? (
            <XStack gap="$2" paddingTop="$2" flexWrap="wrap" justifyContent="center">
              {flags.map((flag) => (
                <XStack
                  key={flag}
                  backgroundColor="$color4"
                  borderRadius="$10"
                  paddingHorizontal="$2.5"
                  paddingVertical="$1"
                  testID={`transaction-flag-${flag.split(" ")[0].toLowerCase()}`}
                >
                  <Paragraph size="$1" fontWeight="600" theme="alt1">
                    {flag}
                  </Paragraph>
                </XStack>
              ))}
            </XStack>
          ) : null}
        </YStack>
      </BlockGroup>

      {txn.line_items.length > 0 ? (
        <YStack gap="$1.5">
          <BlockGroupTitle>
            {txn.line_items.length} {txn.line_items.length === 1 ? "item" : "items"}
          </BlockGroupTitle>
          <BlockGroup testID="transaction-items">
            {txn.line_items.map((li) => (
              <LineItemRow key={li.id} item={li} />
            ))}
          </BlockGroup>
        </YStack>
      ) : (
        <EmptyState
          icon="camera"
          title="No itemized detail"
          message="Charted under “Not itemized”. Scan a receipt to itemize it — reconciliation will offer to merge the two."
          actionLabel="Scan a receipt"
          onAction={() => router.push("/scan")}
        />
      )}

      {/* Only what the total is made OF. Repeating the total here restated the hero two thumb-
          widths below itself; and with nothing to break down there is nothing to show, so the
          whole section goes rather than rendering a block with one echoed line in it. */}
      {hasBreakdown ? (
        <YStack gap="$1.5">
          <BlockGroupTitle>Breakdown</BlockGroupTitle>
          <BlockGroup testID="transaction-summary">
            {txn.subtotal_cents != null ? (
              <SummaryRow label="Subtotal" value={formatCents(txn.subtotal_cents)} />
            ) : null}
            {txn.tax_cents > 0 ? (
              <SummaryRow label="Tax" value={formatCents(txn.tax_cents)} />
            ) : null}
            {txn.tip_cents > 0 ? (
              <SummaryRow label="Tip" value={formatCents(txn.tip_cents)} />
            ) : null}
          </BlockGroup>
        </YStack>
      ) : null}
    </Screen>
  );
}

/**
 * One line item. Same geometry as TransactionRow — a block row is a block row, whichever screen
 * it is on, and a detail screen whose rows are a different height reads as a different app.
 */
function LineItemRow({ item }: { item: LineItem }) {
  // Hidden items are excluded from spending but still listed; lightening says so at a glance,
  // exactly as in the transactions list.
  const ink = item.hidden ? "$color10" : undefined;

  return (
    <XStack
      alignItems="center"
      justifyContent="space-between"
      gap="$3"
      paddingVertical="$3"
      paddingHorizontal={BLOCK_PADDING_X}
      testID={`line-item-${item.id}`}
    >
      <YStack flex={1} gap="$1.5" alignItems="flex-start">
        {/* normalized_name first: it is what recurring detection keys on (CLAUDE.md #10), so
            showing it keeps the screen honest about what was actually recorded. */}
        <Paragraph fontWeight="500" color={ink} numberOfLines={2}>
          {item.normalized_name ?? item.raw_name}
        </Paragraph>
        {item.category_name ? (
          <CategoryChip name={item.category_name} />
        ) : (
          <Paragraph size="$2" theme="alt2">
            Not itemized
          </Paragraph>
        )}
        {item.hidden ? (
          <Paragraph size="$1" theme="alt2">
            Hidden from spending
          </Paragraph>
        ) : null}
      </YStack>

      <Paragraph fontWeight="500" color={ink}>
        {formatCents(item.price_cents)}
      </Paragraph>
    </XStack>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <XStack
      justifyContent="space-between"
      gap="$3"
      paddingVertical="$3"
      paddingHorizontal={BLOCK_PADDING_X}
    >
      <Paragraph fontWeight={bold ? "700" : "400"}>{label}</Paragraph>
      <Paragraph fontWeight={bold ? "700" : "400"}>{value}</Paragraph>
    </XStack>
  );
}
