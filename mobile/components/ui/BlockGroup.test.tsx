import { Paragraph } from "tamagui";

import { BlockGroup, BlockGroupTitle } from "@/components/ui/BlockGroup";
import { BLOCK_RADIUS, BLOCK_TITLE_INSET } from "@/components/ui/grouped";
import { renderWithProviders, screen } from "@/test-utils";

function Row({ label }: { label: string }) {
  return <Paragraph>{label}</Paragraph>;
}

/**
 * BlockGroup is the single owner of grouped-list appearance — transactions, connected accounts
 * and settings rows all render through it. Everything asserted here is something that looks
 * broken on screen but is invisible in a diff.
 */
describe("BlockGroup", () => {
  it("rounds only the outer corners of a multi-row group", async () => {
    await renderWithProviders(
      <BlockGroup>
        <Row label="a" />
        <Row label="b" />
        <Row label="c" />
      </BlockGroup>,
    );

    expect(screen.getByTestId("block-row-0")).toHaveStyle({
      borderTopLeftRadius: BLOCK_RADIUS,
      borderBottomLeftRadius: 0,
    });
    expect(screen.getByTestId("block-row-1")).toHaveStyle({
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    });
    expect(screen.getByTestId("block-row-2")).toHaveStyle({
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: BLOCK_RADIUS,
    });
  });

  it("rounds all four corners of a lone row", async () => {
    await renderWithProviders(
      <BlockGroup>
        <Row label="only" />
      </BlockGroup>,
    );

    expect(screen.getByTestId("block-row-0")).toHaveStyle({
      borderTopLeftRadius: BLOCK_RADIUS,
      borderTopRightRadius: BLOCK_RADIUS,
      borderBottomLeftRadius: BLOCK_RADIUS,
      borderBottomRightRadius: BLOCK_RADIUS,
    });
  });

  it("puts a separator between rows but not above the first", async () => {
    await renderWithProviders(
      <BlockGroup>
        <Row label="a" />
        <Row label="b" />
        <Row label="c" />
      </BlockGroup>,
    );

    expect(screen.getAllByTestId("block-separator")).toHaveLength(2);
  });

  it("ignores absent children when deciding which corners to round", async () => {
    // `{cond ? <Row/> : null}` is the natural way to write a conditional row. If nulls counted,
    // the last *rendered* row would be square-bottomed and the block would look clipped.
    await renderWithProviders(
      <BlockGroup>
        <Row label="a" />
        {null}
      </BlockGroup>,
    );

    expect(screen.queryByTestId("block-row-1")).toBeNull();
    expect(screen.getByTestId("block-row-0")).toHaveStyle({
      borderBottomLeftRadius: BLOCK_RADIUS,
    });
  });

  it("renders nothing when it has no rows", async () => {
    await renderWithProviders(<BlockGroup testID="empty">{null}</BlockGroup>);
    expect(screen.queryByTestId("empty")).toBeNull();
  });

  it("gives rows a real background rather than silently no colour", async () => {
    // $blockBackground is a hand-defined theme token; a typo would render nothing at all,
    // which on a white page looks exactly like success.
    await renderWithProviders(
      <BlockGroup>
        <Row label="a" />
      </BlockGroup>,
    );

    const style = screen.getByTestId("block-row-0").props.style;
    expect(style.backgroundColor).toMatch(/^hsla?\(/);
  });
});

describe("BlockGroupTitle", () => {
  it("insets the title to line up with the block below it", async () => {
    await renderWithProviders(<BlockGroupTitle>Sunday</BlockGroupTitle>);
    expect(screen.getByText("Sunday")).toHaveStyle({ paddingLeft: BLOCK_TITLE_INSET });
  });
});
