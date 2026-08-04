import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { H3, Paragraph, Separator, XStack, YStack } from "tamagui";

import {
  useRecomputeSubscriptions,
  useSetSubscriptionStatus,
  useSubscriptions,
  useSubscriptionSummary,
} from "@shared/api/hooks";
import type { Subscription, SubscriptionStatus } from "@shared/api/types";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Screen,
  useToast,
} from "@/components/ui";

const statusLabel: Record<SubscriptionStatus, string> = {
  detected: "Detected",
  confirmed: "Confirmed",
  dismissed: "Dismissed",
  cancelled: "Cancelled",
};

/**
 * Subscriptions — recurring charges detected from transaction history.
 *
 * Detection is server-side and keys on canonical_name (CLAUDE.md #10); this screen only
 * presents the result and lets the user correct the lifecycle status, which is the one thing
 * detection can't infer reliably (a charge stopping could mean cancelled, or just late).
 */
export default function SubscriptionsScreen() {
  const router = useRouter();
  const toast = useToast();
  const subs = useSubscriptions();
  const summary = useSubscriptionSummary();
  const recompute = useRecomputeSubscriptions();
  const setStatus = useSetSubscriptionStatus();

  async function rescan() {
    try {
      await recompute.mutateAsync();
      toast.success("Rescanned your history");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't rescan");
    }
  }

  async function changeStatus(sub: Subscription, status: SubscriptionStatus) {
    if (!sub.id) return;
    try {
      await setStatus.mutateAsync({ id: sub.id, status });
      toast.success(status === "cancelled" ? "Marked cancelled" : "Updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  }

  const active = (subs.data ?? []).filter((s) => s.status === "detected" || s.status === "confirmed");

  return (
    <Screen testID="subscriptions-screen">
      <XStack alignItems="center" gap="$2">
        <Button
          variant="ghost"
          circular
          icon={<Feather name="arrow-left" size={20} />}
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
        <H3 flex={1}>Subscriptions</H3>
        <Button
          variant="ghost"
          size="sm"
          loading={recompute.isPending}
          onPress={() => void rescan()}
          testID="rescan"
        >
          {recompute.isPending ? "Scanning…" : "Rescan"}
        </Button>
      </XStack>

      {summary.data ? (
        <Card testID="subscription-summary">
          <XStack justifyContent="space-between">
            <YStack>
              <Paragraph size="$2" theme="alt2">
                Monthly
              </Paragraph>
              <Paragraph fontSize={24} fontWeight="700">
                {formatCents(summary.data.total_monthly_cents)}
              </Paragraph>
            </YStack>
            <YStack alignItems="flex-end">
              <Paragraph size="$2" theme="alt2">
                Per year
              </Paragraph>
              <Paragraph fontSize={24} fontWeight="700">
                {formatCents(summary.data.annualized_cents)}
              </Paragraph>
            </YStack>
          </XStack>
          <Paragraph size="$2" theme="alt2">
            {summary.data.active_count} active subscription
            {summary.data.active_count === 1 ? "" : "s"}
          </Paragraph>
        </Card>
      ) : null}

      {subs.isLoading ? (
        <ListSkeleton rows={5} />
      ) : subs.isError ? (
        <ErrorState message="Couldn't load subscriptions." onRetry={() => void subs.refetch()} />
      ) : active.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="No subscriptions found"
          message="Recurring charges appear here once there's enough history to spot a pattern."
        />
      ) : (
        <Card flat padding="$0">
          {active.map((s, i) => (
            <YStack key={s.id ?? s.merchant}>
              {i > 0 ? <Separator /> : null}
              <SubscriptionRow
                subscription={s}
                busy={setStatus.isPending}
                onCancel={() => void changeStatus(s, "cancelled")}
                onIgnore={() => void changeStatus(s, "dismissed")}
              />
            </YStack>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function SubscriptionRow({
  subscription,
  busy,
  onCancel,
  onIgnore,
}: {
  subscription: Subscription;
  busy: boolean;
  onCancel: () => void;
  onIgnore: () => void;
}) {
  const { display_name, amount_cents, cadence, monthly_cost_cents, next_charge_on, status } =
    subscription;

  return (
    <YStack padding="$3" gap="$2" testID={`subscription-${display_name}`}>
      <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
        <YStack flex={1} gap="$1">
          <Paragraph fontWeight="600">{display_name}</Paragraph>
          <Paragraph size="$2" theme="alt2">
            {formatCents(amount_cents)} · {cadence} · next{" "}
            {format(parseISODate(next_charge_on), "MMM d")}
          </Paragraph>
          {status !== "detected" && status !== "confirmed" ? (
            <Paragraph size="$1" theme="alt2">
              {statusLabel[status]}
            </Paragraph>
          ) : null}
        </YStack>
        <YStack alignItems="flex-end">
          <Paragraph fontWeight="600">{formatCents(monthly_cost_cents)}</Paragraph>
          <Paragraph size="$1" theme="alt2">
            /mo
          </Paragraph>
        </YStack>
      </XStack>

      <XStack gap="$2">
        <Button variant="ghost" size="sm" disabled={busy} onPress={onCancel} testID="mark-cancelled">
          Mark cancelled
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onPress={onIgnore} testID="ignore">
          Ignore
        </Button>
      </XStack>
    </YStack>
  );
}
