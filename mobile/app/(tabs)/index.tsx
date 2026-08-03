import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Button, H2, Paragraph, Separator, XStack, YStack } from "tamagui";

import { useNotifications, useReviews, useSpending, useTransactions } from "@shared/api/hooks";
import { formatRangeLabel, rangePresets } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
import { SpendingPie } from "@/components/SpendingPie";
import { TransactionRow } from "@/components/TransactionRow";
import { Card, ChartSkeleton, EmptyState, ErrorState, ListSkeleton, Screen, Skeleton } from "@/components/ui";

/**
 * Home — the daily loop (user-flow §2): spending total + pie for a selectable range
 * (defaults to this month), review/subscription banners, and recent transactions.
 */
export default function HomeScreen() {
  const router = useRouter();
  const [range, setRange] = useState<DateRangeValue>(() => {
    const p = rangePresets()[0]; // This month
    return { start: p.start, end: p.end };
  });

  const spending = useSpending(range.start, range.end);
  const recent = useTransactions();
  const reviews = useReviews();
  const alerts = useNotifications(true);

  const hasSpending = (spending.data?.slices.length ?? 0) > 0;
  const reviewCount = reviews.data?.length ?? 0;
  const alertCount = alerts.data?.length ?? 0;

  return (
    <Screen testID="home-screen">
      <XStack alignItems="center" justifyContent="space-between">
        <H2>Home</H2>
        <Button
          size="$3"
          circular
          chromeless
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
        >
          <Feather name="settings" size={20} />
        </Button>
      </XStack>

      {reviewCount > 0 ? (
        <Banner
          icon="alert-triangle"
          tone="$yellow4"
          label={`${reviewCount} transaction${reviewCount === 1 ? "" : "s"} need review`}
          onPress={() => router.push("/review")}
        />
      ) : null}

      {alertCount > 0 ? (
        <Banner
          icon="zap"
          tone="$blue4"
          label={`${alertCount} subscription alert${alertCount === 1 ? "" : "s"}`}
          // Native-first: web nested these under /earn as sub-routes of a tab. Here they're
          // pushed screens on top of the tab, which is the standard native pattern and keeps
          // the tab bar visible rather than nesting navigators.
          onPress={() => router.push("/subscriptions")}
        />
      ) : null}

      <XStack alignItems="flex-start" justifyContent="space-between" gap="$3">
        <YStack gap="$1" flex={1}>
          {spending.isLoading ? (
            <Skeleton width={160} height={34} />
          ) : (
            <>
              <Paragraph fontSize={32} fontWeight="700" lineHeight={38}>
                {formatCents(spending.data?.total_cents ?? 0)}
              </Paragraph>
              <Paragraph size="$2" theme="alt2">
                spent · {formatRangeLabel(range.start, range.end)}
              </Paragraph>
            </>
          )}
        </YStack>
        <DateRangePicker value={range} onChange={setRange} />
      </XStack>

      {spending.isLoading ? (
        <ChartSkeleton />
      ) : spending.isError ? (
        <ErrorState message="Couldn't load your spending." onRetry={() => void spending.refetch()} />
      ) : hasSpending ? (
        <SpendingPie slices={spending.data!.slices} />
      ) : (
        <EmptyState
          title="Nothing tracked in this range"
          message="Scan a receipt or add a purchase to get started."
          actionLabel="Add a purchase"
          icon="pie-chart"
          onAction={() => router.push("/add")}
        />
      )}

      <YStack gap="$2">
        <XStack alignItems="center" justifyContent="space-between">
          <Paragraph fontWeight="600">Recent</Paragraph>
          <Button size="$2" chromeless onPress={() => router.push("/transactions")}>
            See all →
          </Button>
        </XStack>

        {recent.isLoading ? (
          <ListSkeleton rows={4} />
        ) : recent.isError ? (
          <ErrorState message="Couldn't load transactions." onRetry={() => void recent.refetch()} />
        ) : recent.data && recent.data.length > 0 ? (
          <Card flat padding="$0">
            {recent.data.slice(0, 6).map((t, i) => (
              <YStack key={t.id}>
                {i > 0 ? <Separator /> : null}
                <TransactionRow
                  transaction={t}
                  onPress={() => router.push(`/transactions/${t.id}`)}
                />
              </YStack>
            ))}
          </Card>
        ) : (
          <Paragraph size="$2" theme="alt2">
            No transactions yet.
          </Paragraph>
        )}
      </YStack>
    </Screen>
  );
}

function Banner({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  tone: string;
  onPress: () => void;
}) {
  return (
    <XStack
      alignItems="center"
      gap="$2"
      padding="$3"
      borderRadius="$4"
      backgroundColor={tone}
      onPress={onPress}
      pressStyle={{ opacity: 0.7 }}
      accessibilityRole="button"
    >
      <Feather name={icon} size={16} />
      <Paragraph size="$2" fontWeight="600" flex={1}>
        {label}
      </Paragraph>
      <Paragraph size="$2">→</Paragraph>
    </XStack>
  );
}
