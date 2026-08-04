/**
 * Grouped-list geometry — the iOS pattern of stacking rows into one continuous rounded block.
 *
 * Only the outer corners of a group are rounded: the first row's top pair and the last row's
 * bottom pair. Rows in between are square, so the group reads as a single surface rather than a
 * stack of separate pills. A lone row is both first and last and is rounded all round.
 *
 * Shared rather than repeated because transaction rows, connected-account rows and settings
 * rows all use it, and a group whose radii disagree looks broken in a way that is easy to ship.
 */
export const BLOCK_RADIUS = 18;

/**
 * The page is white; blocks are the light step above it.
 *
 * The pairing is the point: a block set to the same value as its page is invisible, which is
 * what happened when both were `$color2` and the rows disappeared into the background. These
 * two constants must always differ — change one and check the other.
 *
 * `$blockBackground` is a custom token defined in tamagui.config.ts: the v4 ramp has no step
 * between `$color1` (100%) and `$color2` (95%), and 95% read too heavy against a white page.
 */
export const BLOCK_BACKGROUND = "$blockBackground";

/** The page behind the blocks. Set explicitly rather than inherited from the navigator, which
 *  was supplying a grey of its own. */
export const SCREEN_BACKGROUND = "$color1";

/**
 * Divider between rows inside one block. It is the PAGE colour, not a hairline: a white gap
 * slices the grey block into visibly separate rows, which reads more clearly than a grey-on-grey
 * line at this contrast. It must therefore track SCREEN_BACKGROUND, not a border token.
 */
export const BLOCK_SEPARATOR_COLOR = SCREEN_BACKGROUND;
export const BLOCK_SEPARATOR_WIDTH = 1;

/**
 * Left inset for a heading sitting above a block (e.g. a day heading over its transactions).
 *
 * Deliberately a little less than BLOCK_RADIUS. Matching the radius exactly is the geometric
 * answer, but it reads as over-indented: the heading is small uppercase text and its optical
 * left edge sits inside its glyph box, so it needs to start further left to look aligned with
 * the block below. Tuned by eye against the rendered screen, which is the only way to settle
 * an optical question.
 */
export const BLOCK_TITLE_INSET = 10;

/** Horizontal padding inside a block row. Shared so every grouped list indents its content
 *  identically — a row that sets its own drifts the moment another list is added. */
export const BLOCK_PADDING_X = 18;

export function blockCorners(first: boolean, last: boolean) {
  return {
    borderTopLeftRadius: first ? BLOCK_RADIUS : 0,
    borderTopRightRadius: first ? BLOCK_RADIUS : 0,
    borderBottomLeftRadius: last ? BLOCK_RADIUS : 0,
    borderBottomRightRadius: last ? BLOCK_RADIUS : 0,
  } as const;
}
