import { Children, type ReactNode } from "react";
import { Separator, Sheet, XStack, YStack, Paragraph } from "tamagui";

import { BLOCK_RADIUS, SHEET_PADDING_X } from "./grouped";

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
 *  - Content is inset by SHEET_PADDING_X, which is the screen's padding PLUS a row's, so a
 *    sheet's labels line up with the labels in the list behind it.
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
        paddingHorizontal={SHEET_PADDING_X}
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
  );
}

/**
 * A list of SheetRows, with dividers BETWEEN them and none after the last.
 *
 * SheetRow used to draw its own trailing divider, which left a line dangling under the final row
 * and — where a caller added its own divider below the list — two lines stacked. Owning the
 * separators in the container is the same fix as BlockGroup: the row renders content, the list
 * decides what goes between.
 */
export function SheetList({ children, testID }: { children: ReactNode; testID?: string }) {
  // Nulls are ignored, so `{cond ? <SheetRow/> : null}` can't leave a divider with nothing
  // under it.
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <YStack testID={testID}>
      {rows.map((row, i) => (
        <YStack key={i}>
          {i > 0 ? <Separator /> : null}
          {row}
        </YStack>
      ))}
    </YStack>
  );
}
