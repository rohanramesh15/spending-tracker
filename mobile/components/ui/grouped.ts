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

export function blockCorners(first: boolean, last: boolean) {
  return {
    borderTopLeftRadius: first ? BLOCK_RADIUS : 0,
    borderTopRightRadius: first ? BLOCK_RADIUS : 0,
    borderBottomLeftRadius: last ? BLOCK_RADIUS : 0,
    borderBottomRightRadius: last ? BLOCK_RADIUS : 0,
  } as const;
}
