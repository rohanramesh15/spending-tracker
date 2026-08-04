import { Children, type ReactNode } from "react";
import { Paragraph, YStack } from "tamagui";

import {
  BLOCK_BACKGROUND,
  BLOCK_SEPARATOR_COLOR,
  BLOCK_SEPARATOR_WIDTH,
  BLOCK_TITLE_INSET,
  blockCorners,
} from "./grouped";

/**
 * THE grouped list container. Every stacked-rows surface in the app is one of these.
 *
 * It owns the surface, the corner arithmetic and the separators, so a change to any of those
 * happens once and reaches every list. Before this existed, Home, Transactions and Settings
 * each assembled their own — the same look, maintained in three places, which is how a design
 * change gets half-applied without anyone noticing.
 *
 * Children are the rows. Each is given its own background and the correct corners for its
 * position, so a row component does NOT style its own surface — it just renders content.
 */
export function BlockGroup({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  // Ignores nulls, so callers can write `{cond ? <Row/> : null}` without the corner
  // arithmetic silently counting an absent row and rounding the wrong one.
  const rows = Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;

  return (
    <YStack testID={testID}>
      {rows.map((row, i) => (
        <YStack key={i}>
          {/* Page-coloured, so it cuts the block rather than drawing a line on it. */}
          {i > 0 ? (
            <YStack
              height={BLOCK_SEPARATOR_WIDTH}
              backgroundColor={BLOCK_SEPARATOR_COLOR}
              testID="block-separator"
            />
          ) : null}
          <YStack
            backgroundColor={BLOCK_BACKGROUND}
            {...blockCorners(i === 0, i === rows.length - 1)}
            testID={`block-row-${i}`}
          >
            {row}
          </YStack>
        </YStack>
      ))}
    </YStack>
  );
}

/**
 * Heading above a BlockGroup — a day on the ledger, a section in Settings.
 *
 * Small, uppercase and lighter than body text because it is orientation rather than content,
 * and inset so its left edge lines up with the block below it.
 */
export function BlockGroupTitle({ children }: { children: ReactNode }) {
  return (
    <Paragraph
      size="$1"
      color="$color10"
      textTransform="uppercase"
      fontWeight="600"
      paddingLeft={BLOCK_TITLE_INSET}
    >
      {children}
    </Paragraph>
  );
}
