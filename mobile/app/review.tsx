import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { Paragraph, XStack, YStack } from "tamagui";

import { useResolveReview, useReviews } from "@shared/api/hooks";
import type { Resolution } from "@shared/api/types";
import { ReviewCard } from "@/components/ReviewCard";
import { Button, EmptyState, ErrorState, ListSkeleton, PageTitle, Screen, useToast } from "@/components/ui";

const doneMessage: Record<Resolution, string> = {
  merge: "Merged",
  keep_both: "Kept both",
  replace: "Replaced",
  skip: "Skipped",
};

/**
 * Review queue (user-flow §6) — drain unattended reconciliation matches.
 *
 * Unattended matches (webhooks, scheduled syncs) are saved as needs_review rather than merged
 * (CLAUDE.md #5), and are excluded from the charts until resolved (CLAUDE.md #6). This screen
 * is how that queue gets emptied.
 */
export default function ReviewQueueScreen() {
  const router = useRouter();
  const toast = useToast();
  const reviews = useReviews();
  const resolve = useResolveReview();

  async function act(reviewId: string, resolution: Resolution) {
    try {
      await resolve.mutateAsync({ reviewId, resolution });
      toast.success(doneMessage[resolution]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resolve that");
    }
  }

  return (
    <Screen testID="review-screen">
      <XStack alignItems="center" gap="$2">
        <Button
          variant="ghost"
          circular
          icon={<Feather name="arrow-left" size={20} />}
          accessibilityLabel="Back"
          onPress={() => router.back()}
        />
        <PageTitle>Review</PageTitle>
      </XStack>

      {reviews.isLoading ? (
        <ListSkeleton rows={4} />
      ) : reviews.isError ? (
        <ErrorState message="Couldn't load the review queue." onRetry={() => void reviews.refetch()} />
      ) : reviews.data && reviews.data.length > 0 ? (
        <YStack gap="$3">
          <Paragraph size="$2" theme="alt2">
            {reviews.data.length} possible duplicate{reviews.data.length === 1 ? "" : "s"} — pick
            what to keep.
          </Paragraph>
          {reviews.data.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              busy={resolve.isPending}
              onResolve={(id, resolution) => void act(id, resolution)}
            />
          ))}
        </YStack>
      ) : (
        <EmptyState
          icon="check-circle"
          title="All caught up"
          message="Nothing needs review right now."
        />
      )}
    </Screen>
  );
}
