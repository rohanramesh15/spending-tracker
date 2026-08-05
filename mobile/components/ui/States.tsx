import Feather from "@expo/vector-icons/Feather";
import { H3, Paragraph, YStack } from "tamagui";

import { Button } from "./Button";

/**
 * Empty and error states. user-flow §10 and CLAUDE.md's definition of done both require these
 * to exist as real screens states, not afterthoughts — so they live in the design system where
 * every screen can reach them, rather than being re-improvised per screen.
 */
export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  icon = "inbox",
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: keyof typeof Feather.glyphMap;
}) {
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      gap="$3"
      paddingVertical="$8"
      paddingHorizontal="$4"
      testID="empty-state"
    >
      <Feather name={icon} size={32} color="#9a9a94" />
      <H3 textAlign="center">{title}</H3>
      {message ? (
        <Paragraph theme="alt2" textAlign="center">
          {message}
        </Paragraph>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant="secondary" onPress={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </YStack>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      gap="$3"
      paddingVertical="$8"
      paddingHorizontal="$4"
      testID="error-state"
    >
      <Feather name="alert-circle" size={32} color="#e34948" />
      <H3 textAlign="center">{title}</H3>
      {message ? (
        <Paragraph theme="alt2" textAlign="center">
          {message}
        </Paragraph>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" onPress={onRetry}>
          Try again
        </Button>
      ) : null}
    </YStack>
  );
}
