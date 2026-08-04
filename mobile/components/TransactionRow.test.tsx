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
    tax_cents: 0,
    tip_cents: 0,
    hidden: false,
    pending: false,
    ...overrides,
  };
}

describe("TransactionRow", () => {
  // The row deliberately shows only vendor / categories / amount. Date and item count were
  // removed; the Transactions list states the date once per day group instead. That heading is
  // now where the CLAUDE.md #2 local-date guard lives — see the "Monday, Mar 2" assertion in
  // app/(tabs)/transactions.test.tsx.
  it("shows vendor and formatted total", async () => {
    await renderWithProviders(<TransactionRow transaction={txn()} />);
    expect(screen.getByText("Kroger")).toBeTruthy();
    expect(screen.getByText("$42.12")).toBeTruthy();
  });

  it("lists categories as plain text, capped so a busy receipt can't overrun the row", async () => {
    await renderWithProviders(
      <TransactionRow
        transaction={txn({
          categories: ["Food and Drinks", "Shopping", "Health", "Services", "Entertainment"],
        })}
      />,
    );
    // Names are joined into one line, and only the first three appear.
    expect(screen.getByText("Food & Drinks · Shopping · Health")).toBeTruthy();
    expect(screen.queryByText(/Entertainment/)).toBeNull();
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

  describe("row actions", () => {
    // Long-press alone is invisible: nothing on screen advertises it, so Edit/Hide/Delete were
    // unreachable unless you happened to guess the gesture. Both affordances must keep working.
    it("opens the menu from the visible actions button", async () => {
      const onOpenMenu = jest.fn();
      await renderWithProviders(<TransactionRow transaction={txn()} onOpenMenu={onOpenMenu} />);

      await fireEvent.press(screen.getByTestId("transaction-actions-t1"));

      expect(onOpenMenu).toHaveBeenCalledTimes(1);
    });

    it("does not navigate to the detail screen when the actions button is pressed", async () => {
      const onPress = jest.fn();
      const onOpenMenu = jest.fn();
      await renderWithProviders(
        <TransactionRow transaction={txn()} onPress={onPress} onOpenMenu={onOpenMenu} />,
      );

      await fireEvent.press(screen.getByTestId("transaction-actions-t1"));

      expect(onOpenMenu).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });

    it("still opens the menu on long-press", async () => {
      const onLongPress = jest.fn();
      await renderWithProviders(
        <TransactionRow transaction={txn()} onLongPress={onLongPress} onOpenMenu={jest.fn()} />,
      );

      await fireEvent(screen.getByTestId("transaction-row-t1"), "longPress");

      expect(onLongPress).toHaveBeenCalledTimes(1);
    });

    it("names the button for screen readers", async () => {
      await renderWithProviders(<TransactionRow transaction={txn()} onOpenMenu={jest.fn()} />);

      // A bare "⋮" tells a screen-reader user nothing; the web row labels it the same way.
      expect(screen.getByLabelText("Actions for Kroger")).toBeTruthy();
    });

    it("renders no actions button where the caller offers no menu", async () => {
      // The Home screen's recent list is navigation-only, matching the web `onOpenMenu &&` guard.
      await renderWithProviders(<TransactionRow transaction={txn()} />);

      expect(screen.queryByTestId("transaction-actions-t1")).toBeNull();
    });
  });
});

describe("transaction-level amounts", () => {
  // Tax and Tip never appear in `categories` (they are stored on the transaction, CLAUDE.md #8),
  // so without this they'd be invisible on the row while having their own pie slices.
  it("tags a row that carried tax", async () => {
    await renderWithProviders(<TransactionRow transaction={txn({ tax_cents: 50 })} />);
    expect(screen.getByText(/Tax/)).toBeTruthy();
  });

  it("tags a row that carried a tip", async () => {
    await renderWithProviders(<TransactionRow transaction={txn({ tip_cents: 200 })} />);
    expect(screen.getByText(/Tip/)).toBeTruthy();
  });

  it("does not tag a row whose tax is zero", async () => {
    await renderWithProviders(<TransactionRow transaction={txn({ tax_cents: 0 })} />);
    expect(screen.queryByText(/Tax/)).toBeNull();
  });

  it("shows tax alongside the line-item categories rather than replacing them", async () => {
    await renderWithProviders(
      <TransactionRow transaction={txn({ categories: ["Food and Drinks"], tax_cents: 50 })} />,
    );
    expect(screen.getByText("Food & Drinks · Tax")).toBeTruthy();
  });

  it("keeps tax visible even when the line-item cap is already reached", async () => {
    await renderWithProviders(
      <TransactionRow
        transaction={txn({
          categories: ["Food and Drinks", "Shopping", "Health", "Services"],
          tax_cents: 50,
        })}
      />,
    );
    expect(screen.getByText(/· Tax$/)).toBeTruthy();
  });
});

describe("category order", () => {
  it("puts Other last, whatever order the API returned", async () => {
    // "Other" is the classifier's fallback and says nothing about what was bought; leading with
    // it buries the labels that do.
    await renderWithProviders(
      <TransactionRow transaction={txn({ categories: ["Other", "Health"] })} />,
    );
    expect(screen.getByText("Health · Other")).toBeTruthy();
  });

  it("does not spend the three-category cap on Other", async () => {
    await renderWithProviders(
      <TransactionRow
        transaction={txn({ categories: ["Other", "Health", "Shopping", "Services"] })}
      />,
    );
    // Other sorts to the end, so it falls outside the cap rather than displacing a real one.
    expect(screen.getByText("Health · Shopping · Services")).toBeTruthy();
  });

  it("keeps Other when it is the only category", async () => {
    await renderWithProviders(<TransactionRow transaction={txn({ categories: ["Other"] })} />);
    expect(screen.getByText("Other")).toBeTruthy();
  });
});
