import type { ReactNode } from "react";
import { Separator, Sheet, XStack, YStack, Paragraph } from "tamagui";

/**
 * Bottom sheet — the native replacement for the web's Radix-based ActionSheet.
 *
 * On web this was a dialog pinned to the bottom edge; here it's a real draggable sheet with a
 * grab handle and snap point, which is what the gesture affordance on a phone should be.
 *
 * KNOWN GAP: no `animation` prop. The animation drivers are configured and work at runtime, but
 * spreading Tamagui's v4 preset into createTamagui loses the animation-key types, so
 * `animation="medium"` fails to typecheck. The sheet opens without a spring until that's
 * resolved — see docs/expo-conversion-plan.md §7.1.
 */
export function AppSheet({
  open,
  onOpenChange,
  children,
  snapPoints = [50],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  snapPoints?: number[];
}) {
  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={snapPoints}
      dismissOnSnapToBottom
    >
      <Sheet.Overlay
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
        backgroundColor="$shadow6"
      />
      <Sheet.Handle />
      <Sheet.Frame padding="$4" gap="$3" backgroundColor="$background">
        {children}
      </Sheet.Frame>
    </Sheet>
  );
}

/**
 * A tappable row inside a sheet. Mirrors the web SheetRow primitive so the two clients present
 * the same set of actions in the same order.
 */
export function SheetRow({
  label,
  onPress,
  destructive,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: ReactNode;
  testID?: string;
}) {
  return (
    <YStack>
      <XStack
        alignItems="center"
        gap="$3"
        paddingVertical="$3"
        onPress={onPress}
        pressStyle={{ opacity: 0.6 }}
        accessibilityRole="button"
        testID={testID}
      >
        {icon}
        <Paragraph color={destructive ? "$red10" : "$color"} fontWeight="500">
          {label}
        </Paragraph>
      </XStack>
      <Separator />
    </YStack>
  );
}
