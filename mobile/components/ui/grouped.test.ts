import {
  BLOCK_BACKGROUND,
  BLOCK_RADIUS,
  SCREEN_BACKGROUND,
  blockCorners,
} from "@/components/ui/grouped";

/**
 * Pure geometry, tested directly. Every grouped list in the app derives its corners from this,
 * so a wrong answer here is wrong everywhere at once — which is exactly why it's centralised.
 */
describe("blockCorners", () => {
  it("rounds the top pair for the first row in a group", () => {
    expect(blockCorners(true, false)).toEqual({
      borderTopLeftRadius: BLOCK_RADIUS,
      borderTopRightRadius: BLOCK_RADIUS,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    });
  });

  it("rounds the bottom pair for the last row in a group", () => {
    expect(blockCorners(false, true)).toEqual({
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: BLOCK_RADIUS,
      borderBottomRightRadius: BLOCK_RADIUS,
    });
  });

  it("leaves a middle row square at both ends", () => {
    // A middle row with any rounding makes the group read as separate pills.
    expect(Object.values(blockCorners(false, false))).toEqual([0, 0, 0, 0]);
  });

  it("rounds all four corners of a lone row", () => {
    expect(Object.values(blockCorners(true, true))).toEqual(
      Array(4).fill(BLOCK_RADIUS),
    );
  });
});

describe("grouped surfaces", () => {
  it("keeps the block a different colour from the page it sits on", () => {
    // Setting these equal makes every row invisible against the background while still
    // rendering, laying out and passing every other test. It has already happened once.
    expect(BLOCK_BACKGROUND).not.toBe(SCREEN_BACKGROUND);
  });
});
