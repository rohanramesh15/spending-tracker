import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { H3, Paragraph, Separator, XStack, YStack } from "tamagui";

import { useCards, useRewardsOptimization } from "@shared/api/hooks";
import { formatCents } from "@shared/lib/money";
import { Button, Card, EmptyState, ErrorState, ListSkeleton, Screen } from "@/components/ui";

/**
 * Card Rewards Optimizer — which card to use per spending category.
 *
 * The optimisation is computed server-side from real spend; this screen presents it and links
 * cards to their reward profiles. Amounts are annualized so the payoff is legible — a few cents
 * per purchase means nothing, the yearly figure is the decision.
 */
export default function RewardsScreen() {
  const router = useRouter();
  const cards = useCards();
  const optimization = useRewardsOptimization();

  const recommendations = optimization.data?.recommendations ?? [];

  return (
    <Screen testID="rewards-screen">
      <XStack alignItems="center" gap="$2">
        <Button
          variant="ghost"
          circular
          icon={<Feather name="arrow-left" size={20} />}
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
        <H3>Card rewards</H3>
      </XStack>

      {optimization.isLoading ? (
        <ListSkeleton rows={5} />
      ) : optimization.isError ? (
        <ErrorState
          message="Couldn't load your rewards analysis."
          onRetry={() => void optimization.refetch()}
        />
      ) : recommendations.length === 0 ? (
        <EmptyState
          icon="credit-card"
          title="No recommendations yet"
          message="Connect a card and build up some spending history, and the best card per category will appear here."
        />
      ) : (
        <>
          {optimization.data?.total_missed_annual_cents ? (
            <Card testID="missed-summary">
              <Paragraph size="$2" theme="alt2">
                Left on the table this year
              </Paragraph>
              <Paragraph fontSize={28} fontWeight="700">
                {formatCents(optimization.data.total_missed_annual_cents)}
              </Paragraph>
              <Paragraph size="$2" theme="alt2">
                By using a different card for the categories below.
              </Paragraph>
            </Card>
          ) : null}

          <Card flat padding="$0">
            {recommendations.map((r, i) => (
              <YStack key={r.reward_category}>
                {i > 0 ? <Separator /> : null}
                <YStack padding="$3" gap="$1" testID={`recommendation-${r.reward_category}`}>
                  <XStack justifyContent="space-between">
                    <Paragraph fontWeight="600">{r.reward_category}</Paragraph>
                    <Paragraph fontWeight="600">
                      {formatCents(r.annualized_spend_cents)}/yr
                    </Paragraph>
                  </XStack>
                  <Paragraph size="$2" theme="alt2">
                    Best card: {r.best_card_name ?? "—"}
                  </Paragraph>
                </YStack>
              </YStack>
            ))}
          </Card>
        </>
      )}

      <YStack gap="$2">
        <Paragraph fontWeight="600">Your cards</Paragraph>
        {cards.isLoading ? (
          <ListSkeleton rows={2} />
        ) : (cards.data ?? []).length === 0 ? (
          <Paragraph size="$2" theme="alt2">
            No cards connected yet.
          </Paragraph>
        ) : (
          <Card flat padding="$0">
            {(cards.data ?? []).map((c, i) => (
              <YStack key={c.id}>
                {i > 0 ? <Separator /> : null}
                <XStack padding="$3" justifyContent="space-between" alignItems="center">
                  <YStack flex={1}>
                    <Paragraph fontWeight="600">
                      {c.name ?? c.institution}
                      {c.mask ? ` ••${c.mask}` : ""}
                    </Paragraph>
                    <Paragraph size="$2" theme="alt2">
                      {c.reward_profile_name ?? "No reward profile set"}
                    </Paragraph>
                  </YStack>
                  {c.needs_confirmation ? (
                    <Paragraph size="$1" color="$orange10">
                      Confirm
                    </Paragraph>
                  ) : null}
                </XStack>
              </YStack>
            ))}
          </Card>
        )}
      </YStack>
    </Screen>
  );
}
