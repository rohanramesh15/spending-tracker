import type { ReactNode } from "react";
import { XStack, YStack } from "tamagui";

import { PageTitle } from "./PageTitle";

/**
 * A screen's header: a centred title with optional accessories either side.
 *
 * The accessories are positioned ABSOLUTELY rather than laid out as flex siblings. In a normal
 * row the title centres in whatever space the buttons leave over, so a screen with a back button
 * on the left and nothing on the right shows a title that is visibly off-centre — and every
 * screen drifts by a different amount depending on what it happens to put beside the title.
 * Taking the accessories out of the flow means the title centres on the SCREEN, identically
 * everywhere, which is the whole point of centring it.
 *
 * `minHeight` reserves the accessory's height so headers with and without buttons line up.
 */
export function PageHeader({
  title,
  left,
  right,
}: {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <XStack alignItems="center" justifyContent="center" minHeight={36}>
      {left ? (
        <YStack position="absolute" left={0} top={0} bottom={0} justifyContent="center">
          {left}
        </YStack>
      ) : null}

      <PageTitle>{title}</PageTitle>

      {right ? (
        <YStack position="absolute" right={0} top={0} bottom={0} justifyContent="center">
          {right}
        </YStack>
      ) : null}
    </XStack>
  );
}
