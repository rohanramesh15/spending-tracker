import type { TransactionListItem } from "@shared/api/types";
import { TransactionList } from "@/components/TransactionList";
import { BLOCK_RADIUS } from "@/components/ui";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

function txn(id: string, overrides: Partial<TransactionListItem> = {}): TransactionListItem {
  return {
    id,
    vendor: `Vendor ${id}`,
    purchased_on: "2026-03-02",
    source: "manual",
    total_cents: 1000,
    currency: "USD",
    review_status: "confirmed",
    item_count: 1,
    categories: [],
    tax_cents: 0,
    tip_cents: 0,
    hidden: false,
    pending: false,
    ...overrides,
  };
}

/**
 * The corner arithmetic is the reason this component exists: Home and Transactions used to
 * duplicate it, and a half-applied change looks broken while being invisible in a diff.
 */
describe("grouped-block corners", () => {
  it("rounds only the outer corners of a multi-row group", async () => {
    await renderWithProviders(<TransactionList items={[txn("a"), txn("b"), txn("c")]} />);

    // The surface belongs to the BlockGroup wrapper, not the row.
    expect(screen.getByTestId("block-row-0")).toHaveStyle({
      borderTopLeftRadius: BLOCK_RADIUS,
      borderBottomLeftRadius: 0,
    });
    // The middle row must be square at BOTH ends or the group reads as separate pills.
    expect(screen.getByTestId("block-row-1")).toHaveStyle({
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: 0,
    });
    expect(screen.getByTestId("block-row-2")).toHaveStyle({
      borderTopLeftRadius: 0,
      borderBottomLeftRadius: BLOCK_RADIUS,
    });
  });

  it("rounds every corner of a lone row", async () => {
    await renderWithProviders(<TransactionList items={[txn("only")]} />);

    expect(screen.getByTestId("block-row-0")).toHaveStyle({
      borderTopLeftRadius: BLOCK_RADIUS,
      borderTopRightRadius: BLOCK_RADIUS,
      borderBottomLeftRadius: BLOCK_RADIUS,
      borderBottomRightRadius: BLOCK_RADIUS,
    });
  });
});

describe("TransactionList", () => {
  it("renders nothing at all when empty, leaving the empty state to the screen", async () => {
    await renderWithProviders(<TransactionList items={[]} testID="list" />);
    expect(screen.queryByTestId("list")).toBeNull();
  });

  it("reports which transaction was tapped", async () => {
    const onPressItem = jest.fn();
    await renderWithProviders(
      <TransactionList items={[txn("a"), txn("b")]} onPressItem={onPressItem} />,
    );

    await fireEvent.press(screen.getByTestId("transaction-row-b"));

    expect(onPressItem).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("offers row actions only when the caller handles them", async () => {
    // Home's recent list is navigation-only; the Transactions tab has the menu.
    await renderWithProviders(<TransactionList items={[txn("a")]} />);
    expect(screen.queryByTestId("transaction-actions-a")).toBeNull();
  });

  it("opens the menu for the right transaction", async () => {
    const onOpenMenu = jest.fn();
    await renderWithProviders(
      <TransactionList items={[txn("a"), txn("b")]} onOpenMenu={onOpenMenu} />,
    );

    await fireEvent.press(screen.getByTestId("transaction-actions-b"));

    expect(onOpenMenu).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("dims a hidden transaction rather than removing it", async () => {
    await renderWithProviders(<TransactionList items={[txn("a", { hidden: true })]} />);
    expect(screen.getByText("Vendor a")).toBeTruthy();
  });
});

describe("block surface", () => {
  it("resolves the custom blockBackground token to a real colour", async () => {
    // $blockBackground is defined by hand in tamagui.config.ts rather than coming from the v4
    // ramp. If that definition were dropped or misspelled, Tamagui would quietly render no
    // background at all — invisible on a white page, and invisible in a diff.
    await renderWithProviders(<TransactionList items={[txn("a")]} />);

    const style = screen.getByTestId("block-row-0").props.style;
    expect(style.backgroundColor).toMatch(/^hsla?\(/);
    expect(style.backgroundColor).not.toBe("transparent");
  });
});
