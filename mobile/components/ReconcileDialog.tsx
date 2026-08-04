import Feather from "@expo/vector-icons/Feather";
import { format } from "date-fns";
import { AlertDialog, Paragraph, XStack, YStack } from "tamagui";

import { Button } from "@/components/ui";

import type { ReconcileMatch, Resolution } from "@shared/api/types";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";

const sourceLabel: Record<string, string> = {
  receipt: "scanned receipt",
  manual: "manual entry",
  plaid: "bank transaction",
};

/**
 * Attended reconciliation (plan §6.3, CLAUDE.md #5 — NEVER auto-merge).
 *
 * Shown the moment a save collides with an existing transaction so the user decides on the
 * spot: merge / keep both / replace / skip. There is deliberately no default action and no
 * dismiss-to-continue: closing cancels the save rather than silently picking an outcome.
 */
export function ReconcileDialog({
  match,
  incoming,
  busy,
  onResolve,
  onCancel,
}: {
  match: ReconcileMatch | null;
  incoming: { vendor: string; total_cents: number };
  busy?: boolean;
  onResolve: (resolution: Resolution) => void;
  onCancel: () => void;
}) {
  const open = match !== null;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay key="overlay" opacity={0.5} />
        <AlertDialog.Content
          key="content"
          bordered
          elevate
          gap="$3"
          width="92%"
          maxWidth={420}
          testID="reconcile-dialog"
        >
          <AlertDialog.Title>Looks like a duplicate</AlertDialog.Title>
          <AlertDialog.Description>
            You already have a {match ? (sourceLabel[match.source] ?? "transaction") : "transaction"}{" "}
            that looks like this one. What should happen?
          </AlertDialog.Description>

          {match ? (
            <XStack gap="$2">
              <YStack flex={1} padding="$3" borderRadius="$4" backgroundColor="$color3" gap="$1">
                <Paragraph size="$1" theme="alt2" textTransform="uppercase">
                  Existing
                </Paragraph>
                <Paragraph fontWeight="600">{match.vendor}</Paragraph>
                <Paragraph size="$2" theme="alt2">
                  {format(parseISODate(match.purchased_on), "MMM d, yyyy")}
                </Paragraph>
                <Paragraph fontWeight="700">{formatCents(match.total_cents)}</Paragraph>
                <Paragraph size="$1" theme="alt2">
                  {match.item_count} {match.item_count === 1 ? "item" : "items"}
                </Paragraph>
              </YStack>

              <YStack flex={1} padding="$3" borderRadius="$4" backgroundColor="$blue3" gap="$1">
                <Paragraph size="$1" theme="alt2" textTransform="uppercase">
                  Adding now
                </Paragraph>
                <Paragraph fontWeight="600">{incoming.vendor}</Paragraph>
                <Paragraph fontWeight="700">{formatCents(incoming.total_cents)}</Paragraph>
              </YStack>
            </XStack>
          ) : null}

          <YStack gap="$2">
            <ResolutionButton
              icon="layers"
              label="Merge — add these items to the existing entry"
              primary
              busy={busy}
              testID="resolve-merge"
              onPress={() => onResolve("merge")}
            />
            <ResolutionButton
              icon="copy"
              label="Keep both — they're different purchases"
              busy={busy}
              testID="resolve-keep_both"
              onPress={() => onResolve("keep_both")}
            />
            <ResolutionButton
              icon="repeat"
              label="Replace — this one is correct, drop the old"
              busy={busy}
              testID="resolve-replace"
              onPress={() => onResolve("replace")}
            />
            <ResolutionButton
              icon="x"
              label="Skip — it's already recorded"
              busy={busy}
              testID="resolve-skip"
              onPress={() => onResolve("skip")}
            />
          </YStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  );
}

function ResolutionButton({
  icon,
  label,
  primary,
  busy,
  onPress,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  primary?: boolean;
  busy?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Button
      variant={primary ? "primary" : "ghost"}
      size="sm"
      fullWidth
      disabled={busy}
      onPress={onPress}
      testID={testID}
    >
      <XStack alignItems="center" gap="$2" flex={1}>
        <Feather name={icon} size={16} />
        <Paragraph size="$2" flex={1}>
          {label}
        </Paragraph>
      </XStack>
    </Button>
  );
}
