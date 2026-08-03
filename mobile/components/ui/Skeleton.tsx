import { YStack } from "tamagui";

/**
 * Loading placeholders. Ported from the web Skeletons.tsx, which exists because user-flow §10
 * requires a filling-in layout rather than a spinner — the shapes must echo the real content
 * so the load doesn't shift the page.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  testID,
}: {
  width?: number | string;
  height?: number;
  testID?: string;
}) {
  return (
    <YStack
      testID={testID ?? "skeleton"}
      width={width as never}
      height={height}
      borderRadius="$3"
      backgroundColor="$color5"
      opacity={0.6}
      // `accessible` is what actually promotes this to an accessibility element; without it
      // the role is set but screen readers (and role-based queries) don't see it.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    />
  );
}

/** Stand-in for the spending pie while it loads. */
export function ChartSkeleton() {
  return (
    <YStack alignItems="center" gap="$3" paddingVertical="$4" testID="chart-skeleton">
      <YStack
        width={180}
        height={180}
        borderRadius={90}
        backgroundColor="$color5"
        opacity={0.6}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading chart"
      />
      <Skeleton width={140} height={12} />
    </YStack>
  );
}

/** Stand-in for a list of transactions. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <YStack gap="$3" testID="list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <YStack key={i} gap="$2">
          <Skeleton width="60%" height={14} />
          <Skeleton width="35%" height={12} />
        </YStack>
      ))}
    </YStack>
  );
}
