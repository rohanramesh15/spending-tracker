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
export const BLOCK_RADIUS = 12;

/** Background for a grouped row. A step up from the page so the block reads as a surface. */
export const BLOCK_BACKGROUND = "$color2";

export function blockCorners(first: boolean, last: boolean) {
  return {
    borderTopLeftRadius: first ? BLOCK_RADIUS : 0,
    borderTopRightRadius: first ? BLOCK_RADIUS : 0,
    borderBottomLeftRadius: last ? BLOCK_RADIUS : 0,
    borderBottomRightRadius: last ? BLOCK_RADIUS : 0,
  } as const;
}
