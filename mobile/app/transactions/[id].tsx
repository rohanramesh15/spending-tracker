import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Paragraph, Separator, XStack, YStack } from "tamagui";

import { useTransaction } from "@shared/api/hooks";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";
import { Button, Card, EmptyState, ErrorState, ListSkeleton, PageTitle, Screen } from "@/components/ui";

/**
 * Transaction detail (user-flow §7): read-only header + line items.
 *
 * Mutating actions (edit / hide / delete) deliberately live on the list's action sheet, not
 * here — this screen is for inspecting a purchase, matching the web split.
 */
export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: txn, isLoading, isError, refetch } = useTransaction(id);

  if (isLoading) {
    return (
      <Screen testID="transaction-detail">
        <ListSkeleton rows={5} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen testID="transaction-detail">
        <ErrorState message="Couldn't load this transaction." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (!txn) {
    return (
      <Screen testID="transaction-detail">
        <EmptyState title="Not found" message="This transaction no longer exists." />
      </Screen>
    );
  }

  return (
    <Screen testID="transaction-detail">
      <XStack alignItems="center" gap="$2">
        <Button
          variant="ghost"
          circular
          icon={<Feather name="arrow-left" size={20} />}
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
        <YStack flex={1}>
          <PageTitle>{txn.vendor}</PageTitle>
          <Paragraph size="$2" theme="alt2">
            {format(parseISODate(txn.purchased_on), "EEEE, MMM d, yyyy")} · {txn.source}
            {txn.pending ? " · pending" : ""}
            {txn.hidden ? " · hidden from spending" : ""}
          </Paragraph>
        </YStack>
      </XStack>

      {txn.line_items.length > 0 ? (
        <Card flat padding="$0">
          {txn.line_items.map((li, i) => (
            <YStack key={li.id} opacity={li.hidden ? 0.5 : 1}>
              {i > 0 ? <Separator /> : null}
              <XStack justifyContent="space-between" alignItems="center" padding="$3" gap="$3">
                <YStack flex={1}>
                  <Paragraph fontWeight="500">{li.normalized_name ?? li.raw_name}</Paragraph>
                  <Paragraph size="$2" theme="alt2">
                    {li.category_name ?? "Not itemized"}
                    {li.hidden ? " · hidden from spending" : ""}
                  </Paragraph>
                </YStack>
                <Paragraph>{formatCents(li.price_cents)}</Paragraph>
              </XStack>
            </YStack>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon="camera"
          title="No itemized detail"
          message="Charted under “Not itemized”. Scan a receipt to itemize it — reconciliation will offer to merge the two."
          actionLabel="Scan a receipt"
          onAction={() => router.push("/scan")}
        />
      )}

      <Card>
        {txn.subtotal_cents != null ? (
          <SummaryRow label="Subtotal" value={formatCents(txn.subtotal_cents)} />
        ) : null}
        {txn.tax_cents > 0 ? <SummaryRow label="Tax" value={formatCents(txn.tax_cents)} /> : null}
        {txn.tip_cents > 0 ? <SummaryRow label="Tip" value={formatCents(txn.tip_cents)} /> : null}
        <SummaryRow label="Total" value={formatCents(txn.total_cents, txn.currency)} bold />
      </Card>
    </Screen>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <XStack justifyContent="space-between">
      <Paragraph fontWeight={bold ? "700" : "400"}>{label}</Paragraph>
      <Paragraph fontWeight={bold ? "700" : "400"}>{value}</Paragraph>
    </XStack>
  );
}
