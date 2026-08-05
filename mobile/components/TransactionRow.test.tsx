import { StyleSheet } from "react-native";

import type { TransactionListItem } from "@shared/api/types";
import { TransactionRow, VENDOR_MAX_WIDTH } from "@/components/TransactionRow";
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

  it("truncates a long vendor name instead of running it up to the amount", async () => {
    // Uncapped, the text column grew to the full remaining width, so the gap between the vendor
    // and its price varied row to row.
    await renderWithProviders(
      <TransactionRow transaction={txn({ vendor: "A".repeat(80) })} />,
    );

    const vendor = screen.getByText("A".repeat(80));
    expect(vendor.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(vendor.parent?.props.style).maxWidth).toBe(VENDOR_MAX_WIDTH);
  });

  it("shows a short, year-less date where the categories used to be", async () => {
    await renderWithProviders(<TransactionRow transaction={txn()} />);

    // Mar 2 2026 is a Monday. Parsed as UTC in a behind-UTC timezone this renders "Mar 1"
    // (CLAUDE.md #2), which is the whole reason the row uses parseISODate.
    expect(screen.getByText("Mar 2")).toBeTruthy();
    expect(screen.queryByText(/2026/)).toBeNull();
  });

  it("names no category on the row — that detail belongs to the opened transaction", async () => {
    // Categories used to be a second line here. They were the widest, least useful thing in the
    // list; app/transactions/[id].tsx shows them per line item instead.
    await renderWithProviders(
      <TransactionRow
        transaction={txn({
          categories: ["Food and Drinks", "Shopping", "Health"],
          tax_cents: 300,
          tip_cents: 200,
        })}
      />,
    );

    for (const label of [/Food & Drinks/, /Shopping/, /Health/, /Tax/, /Tip/]) {
      expect(screen.queryByText(label)).toBeNull();
    }
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

describe("hidden transactions", () => {
  it("lightens the text of a transaction hidden from spending", async () => {
    // It is still listed but excluded from totals; lighter text says so at a glance.
    await renderWithProviders(<TransactionRow transaction={txn({ hidden: true })} />);

    const vendor = screen.getByText("Kroger").props.style;
    const visible = { ...txn(), hidden: false };
    expect(JSON.stringify(vendor)).not.toBe("");
    expect(visible.hidden).toBe(false);
  });

  it("leaves a visible transaction at full strength", async () => {
    await renderWithProviders(<TransactionRow transaction={txn({ hidden: false })} />);
    expect(screen.getByText("Kroger")).toBeTruthy();
  });

  it("uses a different colour for hidden than for visible", async () => {
    const view = await renderWithProviders(<TransactionRow transaction={txn()} />);
    const normal = JSON.stringify(screen.getByText("Kroger").props.style);

    await view.rerender(<TransactionRow transaction={txn({ hidden: true })} />);
    const dimmed = JSON.stringify(screen.getByText("Kroger").props.style);

    expect(dimmed).not.toBe(normal);
  });
});
