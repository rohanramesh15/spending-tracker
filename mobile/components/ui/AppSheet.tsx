import type { ReactNode } from "react";
import { Separator, Sheet, XStack, YStack, Paragraph } from "tamagui";

import { BLOCK_RADIUS } from "./grouped";

/**
 * Bottom sheet — the native replacement for the web's Radix-based ActionSheet.
 *
 * On web this was a dialog pinned to the bottom edge; here it's a real draggable sheet with a
 * grab handle, which is what the gesture affordance on a phone should be.
 *
 * Three deliberate choices, all of which apply to every sheet in the app:
 *  - No grab handle. The sheet is still draggable and still dismisses on a downward swipe or a
 *    backdrop tap; the bar was visual furniture on top of a card whose edge already announces
 *    itself. (Tamagui's own `Sheet.Handle` is worse — it floats ABOVE the frame, reading as a
 *    stray bar on the backdrop rather than part of the sheet.)
 *  - The sheet is sized by its contents (`snapPointsMode="fit"`), not by a percentage of the
 *    screen. A fixed snap point left a short menu stranded in the middle of a tall empty card.
 *  - Corners use BLOCK_RADIUS, the same radius as the grouped blocks, so a sheet reads as the
 *    same family of surface as everything it opens over.
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="fit"
      dismissOnSnapToBottom
    >
      <Sheet.Overlay
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
        backgroundColor="$shadow6"
      />
      <Sheet.Frame
        paddingHorizontal="$4"
        paddingTop="$4"
        paddingBottom="$6"
        gap="$3"
        backgroundColor="$background"
        borderTopLeftRadius={BLOCK_RADIUS}
        borderTopRightRadius={BLOCK_RADIUS}
      >
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
  value,
  onPress,
  destructive,
  icon,
  testID,
}: {
  label: string;
  /** Secondary text on the right — what the row currently resolves to (a date range, a count). */
  value?: string;
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
        <Paragraph color={destructive ? "$red10" : "$color"} fontWeight="500" flex={1}>
          {label}
        </Paragraph>
        {value ? (
          <Paragraph size="$2" theme="alt2" numberOfLines={1}>
            {value}
          </Paragraph>
        ) : null}
      </XStack>
      <Separator />
    </YStack>
  );
}
