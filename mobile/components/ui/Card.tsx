import { styled, YStack } from "tamagui";

/**
 * Grouping surface. The web app leans on bordered boxes; native leans on subtle elevation and
 * generous corner radius, so this is a native-first equivalent rather than a literal port.
 */
export const Card = styled(YStack, {
  name: "Card",
  backgroundColor: "$background",
  borderRadius: "$6",
  padding: "$4",
  gap: "$3",
  borderWidth: 1,
  borderColor: "$borderColor",

  variants: {
    /** Removes the border for cards sitting directly on a grouped background. */
    flat: {
      true: { borderWidth: 0 },
    },
    pressable: {
      true: {
        pressStyle: { opacity: 0.7 },
      },
    },
  } as const,
});
