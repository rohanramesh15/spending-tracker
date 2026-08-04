import { useState } from "react";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Paragraph, XStack, YStack } from "tamagui";

import { useNotifications, useReviews, useSpending, useTransactions } from "@shared/api/hooks";
import { formatRangeLabel, rangePresets } from "@shared/lib/dates";
import { categoryLabel } from "@shared/lib/categories";
import { formatCents } from "@shared/lib/money";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
import { SpendingPie } from "@/components/SpendingPie";
import { TransactionDayGroups } from "@/components/TransactionDayGroups";
import { useTransactionActions } from "@/components/useTransactionActions";
import { ChartSkeleton, EmptyState, ErrorState, ListSkeleton, PageTitle, Screen, Skeleton } from "@/components/ui";
import { filterByCategory } from "@/lib/filterByCategory";

/**
 * Home — the daily loop (user-flow §2): spending total + pie for a selectable range
 * (defaults to this month), review/subscription banners, and recent transactions.
 */
export default function HomeScreen() {
  const router = useRouter();
  // Owned here, not inside the chart: dismissing the selection is a tap that lands OUTSIDE the
  // chart, so only the screen can see it.
  const [pieIndex, setPieIndex] = useState(-1);
  // Home shows the full ledger, so it offers the same row actions as the Transactions tab —
  // from the same hook, so the two can't drift apart.
  const actions = useTransactionActions();
  const [range, setRange] = useState<DateRangeValue>(() => {
    const p = rangePresets()[0]; // This month
    return { start: p.start, end: p.end };
  });

  const spending = useSpending(range.start, range.end);
  // Scoped to the selected range, so the list below the chart is the SAME set of transactions
  // the total and the pie describe. An unscoped list contradicted them.
  const recent = useTransactions({ start: range.start, end: range.end });
  const reviews = useReviews();
  const alerts = useNotifications(true);

  const hasSpending = (spending.data?.slices.length ?? 0) > 0;
  const allTransactions = recent.data ?? [];

  // Selecting a pie slice filters the list beneath it, so the chart acts as the list's control
  // rather than a separate readout. Tapping the page clears both at once (see onBackgroundPress).
  const selectedCategory =
    pieIndex >= 0 ? (spending.data?.slices[pieIndex]?.category ?? null) : null;
  const visibleTransactions = filterByCategory(allTransactions, selectedCategory);
  const reviewCount = reviews.data?.length ?? 0;
  const alertCount = alerts.data?.length ?? 0;

  return (
    <Screen testID="home-screen" onBackgroundPress={() => setPieIndex(-1)}>
      {/* Settings used to be a gear in this header; it is a bottom tab now, so the header is
          just the title. */}
      <PageTitle>Welcome</PageTitle>

      {reviewCount > 0 ? (
        <Banner
          icon="alert-triangle"
          tone="$yellow4"
          // The verb agrees too: web says "1 transaction need review", which is simply wrong.
          label={`${reviewCount} transaction${reviewCount === 1 ? " needs" : "s need"} review`}
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
            // The "spent · <range>" caption is gone by request. The range is not lost: the
            // DateRangePicker sitting immediately to the right of this total states it, so the
            // caption was repeating its neighbour.
            <Paragraph fontSize={32} fontWeight="700" lineHeight={38}>
              {formatCents(spending.data?.total_cents ?? 0)}
            </Paragraph>
          )}
        </YStack>
        <DateRangePicker value={range} onChange={setRange} />
      </XStack>

      {spending.isLoading ? (
        <ChartSkeleton />
      ) : spending.isError ? (
        <ErrorState message="Couldn't load your spending." onRetry={() => void spending.refetch()} />
      ) : hasSpending ? (
        <SpendingPie
          slices={spending.data!.slices}
          activeIndex={pieIndex}
          onActiveIndexChange={setPieIndex}
        />
      ) : (
        <EmptyState
          title="Nothing tracked in this range"
          message="Scan a receipt or add a purchase to get started."
          actionLabel="Add a purchase"
          icon="pie-chart"
          onAction={() => router.push("/add")}
        />
      )}

      {/* The full ledger, not a "Recent" preview with a See all. Home already scrolls, and the
          Transactions tab is one tap away, so truncating it only hid transactions. */}
      <YStack gap="$2">
        {recent.isLoading ? (
          <ListSkeleton rows={4} />
        ) : recent.isError ? (
          <ErrorState message="Couldn't load transactions." onRetry={() => void recent.refetch()} />
        ) : recent.data && recent.data.length > 0 ? (
          <TransactionDayGroups
            items={visibleTransactions}
            onPressItem={(t) => router.push(`/transactions/${t.id}`)}
            onOpenMenu={actions.openMenu}
          />
        ) : (
          <Paragraph size="$2" theme="alt2">
            {selectedCategory
              ? `Nothing in ${categoryLabel(selectedCategory)} for this range.`
              : "No transactions in this range."}
          </Paragraph>
        )}
      </YStack>

      {actions.overlays}
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
