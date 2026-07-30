import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TransactionRow } from "./TransactionRow";
import type { TransactionListItem } from "@/api/types";

const base: TransactionListItem = {
  id: "t1",
  vendor: "Trader Joe's",
  purchased_on: "2026-07-15",
  source: "manual",
  total_cents: 4210,
  currency: "USD",
  item_count: 3,
  review_status: "confirmed",
  pending: false,
  hidden: false,
  categories: [],
};

function renderRow(txn: Partial<TransactionListItem> = {}, onOpenMenu?: () => void) {
  return render(
    <MemoryRouter>
      <ul>
        <TransactionRow txn={{ ...base, ...txn }} onOpenMenu={onOpenMenu} />
      </ul>
    </MemoryRouter>,
  );
}

describe("TransactionRow", () => {
  it("shows the vendor, amount, item count and a link to the detail screen", () => {
    renderRow();
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument();
    expect(screen.getByText("$42.10")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/transactions/t1");
  });

  it("says 'Not itemized' with no line items, and singularizes one", () => {
    const { unmount } = renderRow({ item_count: 0 });
    expect(screen.getByText("Not itemized")).toBeInTheDocument();
    unmount();

    renderRow({ item_count: 1 });
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("appends every state suffix it has", () => {
    renderRow({ review_status: "needs_review", pending: true, hidden: true });
    expect(
      screen.getByText("3 items · needs review · pending · hidden from spending"),
    ).toBeInTheDocument();
  });

  it("opens the row menu without following the row's link", () => {
    const onOpenMenu = vi.fn();
    renderRow({}, onOpenMenu);
    const click = fireEvent.click(
      screen.getByRole("button", { name: /actions for trader joe's/i }),
    );
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    // preventDefault'd, so the Link navigation never fires.
    expect(click).toBe(false);
  });

  it("renders no menu button when onOpenMenu is omitted", () => {
    renderRow();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
