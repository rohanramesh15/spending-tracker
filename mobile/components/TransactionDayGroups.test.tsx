import type { TransactionListItem } from "@shared/api/types";
import { TransactionDayGroups } from "@/components/TransactionDayGroups";
import { BLOCK_TITLE_INSET } from "@/components/ui";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

function txn(id: string, purchased_on: string): TransactionListItem {
  return {
    id,
    vendor: `Vendor ${id}`,
    purchased_on,
    source: "manual",
    total_cents: 1000,
    currency: "USD",
    review_status: "confirmed",
    item_count: 1,
    categories: [],
    hidden: false,
    pending: false,
  };
}

describe("TransactionDayGroups", () => {
  it("puts each day's transactions under its own heading", async () => {
    await renderWithProviders(
      <TransactionDayGroups
        items={[txn("a", "2026-03-02"), txn("b", "2026-03-02"), txn("c", "2026-03-01")]}
      />,
    );

    expect(screen.getByText("Monday, Mar 2")).toBeTruthy();
    expect(screen.getByText("Sunday, Mar 1")).toBeTruthy();
  });

  it("renders the day as a LOCAL calendar date, not shifted through UTC", async () => {
    // `new Date("2026-03-02")` is UTC midnight and renders "Mar 1" anywhere behind UTC. Since
    // the row itself no longer shows a date, this heading is the only place that guard applies
    // (CLAUDE.md #2).
    await renderWithProviders(<TransactionDayGroups items={[txn("a", "2026-03-02")]} />);

    expect(screen.getByText("Monday, Mar 2")).toBeTruthy();
    expect(screen.queryByText(/Mar 1/)).toBeNull();
  });

  it("insets the heading to where the block's corner rounding ends", async () => {
    // Tied to BLOCK_RADIUS so the heading stays aligned when the radius changes.
    await renderWithProviders(<TransactionDayGroups items={[txn("a", "2026-03-02")]} />);

    expect(screen.getByText("Monday, Mar 2")).toHaveStyle({
      paddingLeft: BLOCK_TITLE_INSET,
    });
  });

  it("renders nothing when there are no transactions, leaving the empty state to the screen", async () => {
    await renderWithProviders(<TransactionDayGroups items={[]} testID="groups" />);

    expect(screen.queryByTestId("groups")).toBeNull();
  });

  it("passes taps up with the transaction that was tapped", async () => {
    const onPressItem = jest.fn();
    await renderWithProviders(
      <TransactionDayGroups
        items={[txn("a", "2026-03-02"), txn("c", "2026-03-01")]}
        onPressItem={onPressItem}
      />,
    );

    await fireEvent.press(screen.getByTestId("transaction-row-c"));

    expect(onPressItem).toHaveBeenCalledWith(expect.objectContaining({ id: "c" }));
  });

  it("gives each day its own rounded block rather than one block across days", async () => {
    // Both rows are alone in their day, so each must be rounded top and bottom.
    await renderWithProviders(
      <TransactionDayGroups items={[txn("a", "2026-03-02"), txn("c", "2026-03-01")]} />,
    );

    for (const id of ["a", "c"]) {
      expect(screen.getByTestId(`transaction-row-${id}`)).toHaveStyle({
        borderTopLeftRadius: 18,
        borderBottomLeftRadius: 18,
      });
    }
  });
});
