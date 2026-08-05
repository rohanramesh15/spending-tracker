import type { ReactNode } from "react";
import { Button as TamaguiButton, Paragraph, Spinner, XStack } from "tamagui";

/**
 * THE button. Every pressable label in the app is one of these.
 *
 * Before this existed the app had three informal variants — `theme="active"` (4 uses), plain
 * default (9) and `chromeless` (19) — which is under-differentiation rather than restraint: if
 * nearly everything is low-emphasis, nothing anchors the eye. The six types below are assigned
 * by *purpose*, so the visual weight of a control follows from what it does.
 *
 * Design system: docs and live reference in components/ui/README.md. Values derive from the
 * Tamagui v4 ramps plus the app's own $blockBackground / BLOCK_RADIUS — nothing re-picked here.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "success"
  | "link";

export type ButtonSize = "sm" | "md" | "lg";

/** Height and radius per size. Radii are real steps from the radius scale, chosen so a button's
 *  curve reads as the same family as the 18px grouped blocks. */
const SIZES: Record<ButtonSize, { height: number; radius: number; fontSize: number; px: number }> =
  {
    sm: { height: 32, radius: 10, fontSize: 13, px: 12 },
    md: { height: 44, radius: 16, fontSize: 15, px: 18 },
    lg: { height: 52, radius: 19, fontSize: 16, px: 22 },
  };

/**
 * Colours per variant. `press` is the pressed state — a real step, not an opacity fade, so the
 * press reads on a surface that is already light.
 *
 * Destructive is deliberately the SOFT treatment (red ink on a red tint) rather than a solid
 * fill: every destructive action in this app already sits behind a ConfirmDialog, so the fill
 * isn't needed to slow anyone down, and a solid red row in Settings would be the loudest thing
 * on a deliberately quiet screen.
 */
const VARIANTS: Record<ButtonVariant, { bg: string; press: string; ink: string }> = {
  primary: { bg: "$color12", press: "$color11", ink: "$color1" },
  secondary: { bg: "$blockBackground", press: "$color3", ink: "$color12" },
  ghost: { bg: "transparent", press: "$blockBackground", ink: "$color11" },
  destructive: { bg: "$red2", press: "$red3", ink: "$red10" },
  success: { bg: "$green10", press: "$green11", ink: "#ffffff" },
  link: { bg: "transparent", press: "transparent", ink: "$blue10" },
};

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  iconAfter,
  fullWidth = false,
  loading = false,
  disabled = false,
  circular = false,
  align = "center",
  height,
  labelTestID,
  onPress,
  accessibilityLabel,
  testID,
}: {
  /** Omit for an icon-only button — then `accessibilityLabel` is required. */
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconAfter?: ReactNode;
  /** Stretches to the container. A modifier, not a size — any variant can be full width. */
  fullWidth?: boolean;
  /** Shows a spinner in place of the leading icon and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
  /** Icon-only buttons only: pill instead of a rounded square. */
  circular?: boolean;
  /**
   * "between" pushes the label left and any trailing icon right — the shape a trigger needs
   * (a select showing its current value, with a chevron). "center" is the normal button.
   */
  align?: "center" | "between";
  /**
   * Overrides the size preset's height, for the rare control that has to line up with something
   * outside the button scale — the date-range trigger matches the spending total's 38px line box
   * beside it. Alignment only: reach for a different `size` before reaching for this.
   */
  height?: number;
  /** Addresses the label itself, for triggers whose text also appears in the sheet they open. */
  labelTestID?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const s = { ...SIZES[size], ...(height != null ? { height } : {}) };
  const v = VARIANTS[variant];
  const iconOnly = children == null;

  // A button that is working must not be pressable again — a second tap would fire the same
  // mutation twice, which for ingest means two transactions.
  const inert = disabled || loading;

  if (variant === "link") {
    return (
      <TamaguiButton
        unstyled
        height="auto"
        paddingHorizontal={0}
        backgroundColor="transparent"
        disabled={inert}
        opacity={inert ? 0.45 : 1}
        pressStyle={{ opacity: 0.6 }}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        <XStack alignItems="center" gap="$2">
          {loading ? <Spinner size="small" color={v.ink} /> : icon}
          <Paragraph
            color={v.ink}
            fontSize={s.fontSize}
            fontWeight="600"
            textDecorationLine="underline"
          >
            {children}
          </Paragraph>
          {iconAfter}
        </XStack>
      </TamaguiButton>
    );
  }

  return (
    <TamaguiButton
      unstyled
      flexDirection="row"
      alignItems="center"
      justifyContent={align === "between" ? "space-between" : "center"}
      gap="$2.5"
      height={s.height}
      minWidth={s.height}
      width={iconOnly && !fullWidth ? s.height : undefined}
      flex={fullWidth ? 1 : undefined}
      alignSelf={fullWidth ? "stretch" : undefined}
      paddingHorizontal={iconOnly ? 0 : s.px}
      borderRadius={circular ? 999 : s.radius}
      backgroundColor={v.bg}
      // Disabled is opacity rather than a separate colour, so one rule covers every variant and
      // a new variant cannot ship without a disabled state.
      opacity={inert ? 0.45 : 1}
      disabled={inert}
      pressStyle={{ backgroundColor: v.press }}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      testID={testID}
    >
      {/* The spinner replaces the leading ICON, never the label: swapping the label out changes
          the button's width and moves the control out from under a thumb already on its way. */}
      {loading ? <Spinner size="small" color={v.ink} /> : icon}
      {iconOnly ? null : (
        <Paragraph
          color={v.ink}
          fontSize={s.fontSize}
          fontWeight={align === "between" ? "400" : "600"}
          numberOfLines={1}
          flex={align === "between" ? 1 : undefined}
          testID={labelTestID}
        >
          {children}
        </Paragraph>
      )}
      {iconAfter}
    </TamaguiButton>
  );
}
