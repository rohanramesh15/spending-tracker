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
