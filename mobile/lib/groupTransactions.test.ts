import type { TransactionListItem } from "@shared/api/types";
import { groupByDay } from "@/lib/groupTransactions";

function txn(id: string, purchased_on: string): TransactionListItem {
  return {
    id,
    vendor: "V",
    purchased_on,
    source: "manual",
    total_cents: 100,
    currency: "USD",
    review_status: "confirmed",
    item_count: 0,
    categories: [],
    tax_cents: 0,
    tip_cents: 0,
    hidden: false,
    pending: false,
  };
}

describe("groupByDay", () => {
  it("groups transactions sharing a day", () => {
    const groups = groupByDay([txn("a", "2026-03-02"), txn("b", "2026-03-02")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("orders days newest first", () => {
    const groups = groupByDay([
      txn("old", "2026-01-05"),
      txn("new", "2026-03-02"),
      txn("mid", "2026-02-10"),
    ]);
    expect(groups.map((g) => g.day)).toEqual(["2026-03-02", "2026-02-10", "2026-01-05"]);
  });

  it("orders correctly across a year boundary", () => {
    // String comparison on YYYY-MM-DD must not put December before January of the next year.
    const groups = groupByDay([txn("dec", "2025-12-31"), txn("jan", "2026-01-01")]);
    expect(groups.map((g) => g.day)).toEqual(["2026-01-01", "2025-12-31"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("preserveOrder", () => {
  it("keeps ranked results in the order they arrived", () => {
    // Search returns best-match-first; re-sorting by date would discard that.
    const ranked = [
      txn("best", "2026-01-05"),
      txn("next", "2026-08-20"),
    ];

    const days = groupByDay(ranked, { preserveOrder: true }).map((g) => g.day);

    expect(days).toEqual(["2026-01-05", "2026-08-20"]);
  });

  it("still sorts newest-first by default", () => {
    const items = [
      txn("old", "2026-01-05"),
      txn("new", "2026-08-20"),
    ];

    expect(groupByDay(items).map((g) => g.day)).toEqual(["2026-08-20", "2026-01-05"]);
  });

  it("still groups same-day transactions together when preserving order", () => {
    const items = [
      txn("a", "2026-08-02"),
      txn("b", "2026-01-05"),
      txn("c", "2026-08-02"),
    ];

    const groups = groupByDay(items, { preserveOrder: true });

    expect(groups).toHaveLength(2);
    expect(groups[0].items.map((t) => t.id)).toEqual(["a", "c"]);
  });
});
