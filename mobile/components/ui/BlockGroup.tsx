import { Children, type ReactNode } from "react";
import { Paragraph, YStack } from "tamagui";

import {
  BLOCK_BACKGROUND,
  BLOCK_PADDING_X,
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
          {/* Inset to the rows' own padding, so the line starts where the row's text starts and
              stops where its right padding begins — edge-to-edge read as a cut through the block
              rather than a divider inside it. The band keeps the block's background across the
              full width; only the line itself is inset, page-coloured so it cuts. */}
          {i > 0 ? (
            <YStack backgroundColor={BLOCK_BACKGROUND} testID="block-separator-band">
              <YStack
                height={BLOCK_SEPARATOR_WIDTH}
                marginHorizontal={BLOCK_PADDING_X}
                backgroundColor={BLOCK_SEPARATOR_COLOR}
                testID="block-separator"
              />
            </YStack>
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
 * Small and lighter than body text because it is orientation rather than content, and inset so
 * its left edge lines up with the block below it.
 *
 * Sentence case, NOT uppercase: these headings carry real words — a day ("Monday, Mar 2"), a
 * count — and all-caps made them shout a label rather than name the block underneath.
 */
export function BlockGroupTitle({ children }: { children: ReactNode }) {
  return (
    <Paragraph
      size="$1"
      color="$color10"
      fontWeight="600"
      paddingLeft={BLOCK_TITLE_INSET}
    >
      {children}
    </Paragraph>
  );
}
