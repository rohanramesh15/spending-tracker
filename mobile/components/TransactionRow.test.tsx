import type { TransactionListItem } from "@shared/api/types";
import { TransactionRow } from "@/components/TransactionRow";
import { fireEvent, renderWithProviders, screen } from "@/test-utils";

function txn(overrides: Partial<TransactionListItem> = {}): TransactionListItem {
  return {
    id: "t1",
    vendor: "Kroger",
    purchased_on: "2026-03-02",
    source: "manual",
    total_cents: 4212,
    currency: "USD",
    review_status: "confirmed",
    item_count: 3,
    categories: ["Food and Drinks"],
    hidden: false,
    pending: false,
    ...overrides,
  };
}

describe("TransactionRow", () => {
  it("shows vendor, date and formatted total", async () => {
    await renderWithProviders(<TransactionRow transaction={txn()} />);
    expect(screen.getByText("Kroger")).toBeTruthy();
    expect(screen.getByText("$42.12")).toBeTruthy();
  });

  it("renders purchased_on as a LOCAL date, not shifted through UTC", async () => {
    // new Date("2026-03-02") parses as UTC midnight and renders "Mar 1" anywhere behind UTC.
    // This is the regression CLAUDE.md #2 exists to prevent, so it's pinned explicitly.
    await renderWithProviders(<TransactionRow transaction={txn()} />);
    expect(screen.getByText(/Mar 2/)).toBeTruthy();
  });

  it("pluralises the item count", async () => {
    await renderWithProviders(<TransactionRow transaction={txn({ item_count: 1 })} />);
    expect(screen.getByText(/1 item(?!s)/)).toBeTruthy();
  });

  it("labels an unitemized transaction rather than showing '0 items'", async () => {
    await renderWithProviders(<TransactionRow transaction={txn({ item_count: 0 })} />);
    expect(screen.getByText(/Not itemized/)).toBeTruthy();
  });

  it("caps the category chips so a busy receipt can't overrun the row", async () => {
    await renderWithProviders(
      <TransactionRow
        transaction={txn({
          categories: ["Food and Drinks", "Shopping", "Health", "Services", "Entertainment"],
        })}
      />,
    );
    expect(screen.getByText("Food and Drinks")).toBeTruthy();
    expect(screen.queryByText("Entertainment")).toBeNull();
  });

  it("reports taps and long-presses to the caller", async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    await renderWithProviders(
      <TransactionRow transaction={txn()} onPress={onPress} onLongPress={onLongPress} />,
    );

    await fireEvent.press(screen.getByTestId("transaction-row-t1"));
    expect(onPress).toHaveBeenCalledTimes(1);

    await fireEvent(screen.getByTestId("transaction-row-t1"), "longPress");
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
