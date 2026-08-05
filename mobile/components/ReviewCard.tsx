import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { Paragraph, XStack, YStack } from "tamagui";

import type { Resolution, Review, ReviewTxn } from "@shared/api/types";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";
import { Button, Card } from "@/components/ui";

const sourceLabel: Record<string, string> = {
  plaid: "Bank",
  receipt: "Receipt",
  manual: "Manual",
};

function TxnMini({ label, txn }: { label: string; txn: ReviewTxn }) {
  return (
    <YStack flex={1} padding="$3" borderRadius="$4" backgroundColor="$color3" gap="$1">
      <Paragraph size="$1" theme="alt2" textTransform="uppercase">
        {label} · {sourceLabel[txn.source] ?? txn.source}
      </Paragraph>
      <Paragraph fontWeight="600" numberOfLines={1}>
        {txn.vendor}
      </Paragraph>
      <Paragraph size="$2" theme="alt2">
        {format(parseISODate(txn.purchased_on), "MMM d, yyyy")} ·{" "}
        {txn.item_count > 0 ? `${txn.item_count} item${txn.item_count === 1 ? "" : "s"}` : "no items"}
      </Paragraph>
      <Paragraph fontWeight="700">{formatCents(txn.total_cents)}</Paragraph>
    </YStack>
  );
}

/**
 * One unattended reconciliation match (user-flow §6).
 *
 * These exist precisely because unattended matches are NEVER auto-merged (CLAUDE.md #5) —
 * a webhook or scheduled sync parks them here instead of guessing. The match reason is shown
 * so the decision is informed rather than a coin flip, and resolving one immediately returns
 * the transaction to the charts, which excluded it while it was pending (CLAUDE.md #6).
 */
export function ReviewCard({
  review,
  busy,
  onResolve,
}: {
  review: Review;
  busy: boolean;
  onResolve: (id: string, resolution: Resolution) => void;
}) {
  return (
    <Card testID={`review-card-${review.id}`}>
      <XStack gap="$2">
        <TxnMini label="Incoming" txn={review.incoming} />
        <TxnMini label="Existing" txn={review.matched} />
      </XStack>

      <Paragraph size="$2" theme="alt2">
        {review.reason}
      </Paragraph>

      <YStack gap="$2">
        <XStack gap="$2">
          <ResolveButton
            flex
            primary
            icon="layers"
            label="Merge"
            busy={busy}
            testID={`review-${review.id}-merge`}
            onPress={() => onResolve(review.id, "merge")}
          />
          <ResolveButton
            flex
            icon="copy"
            label="Keep both"
            busy={busy}
            testID={`review-${review.id}-keep_both`}
            onPress={() => onResolve(review.id, "keep_both")}
          />
        </XStack>
        <XStack gap="$2">
          <ResolveButton
            flex
            icon="repeat"
            label="Replace"
            busy={busy}
            testID={`review-${review.id}-replace`}
            onPress={() => onResolve(review.id, "replace")}
          />
          <ResolveButton
            flex
            chromeless
            icon="x"
            label="Skip"
            busy={busy}
            testID={`review-${review.id}-skip`}
            onPress={() => onResolve(review.id, "skip")}
          />
        </XStack>
      </YStack>
    </Card>
  );
}

function ResolveButton({
  icon,
  label,
  primary,
  chromeless,
  busy,
  onPress,
  testID,
  flex,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  primary?: boolean;
  chromeless?: boolean;
  busy?: boolean;
  onPress: () => void;
  testID: string;
  flex?: boolean;
}) {
  return (
    <Button
      variant={primary ? "primary" : chromeless ? "ghost" : "secondary"}
      size="sm"
      fullWidth={flex}
      disabled={busy}
      icon={<Feather name={icon} size={14} />}
      onPress={onPress}
      testID={testID}
    >
      {label}
    </Button>
  );
}
