import type { TransactionListItem } from "@shared/api/types";
import { filterByCategory, isFilterableCategory, UNCATEGORIZED } from "@/lib/filterByCategory";

function txn(id: string, categories: string[]): TransactionListItem {
  return {
    id,
    vendor: `V${id}`,
    purchased_on: "2026-03-02",
    source: "manual",
    total_cents: 100,
    currency: "USD",
    review_status: "confirmed",
    item_count: categories.length,
    categories,
    hidden: false,
    pending: false,
  };
}

const items = [
  txn("food", ["Food and Drinks"]),
  txn("mixed", ["Food and Drinks", "Other"]),
  txn("other", ["Other"]),
  txn("unitemized", []),
];

describe("filterByCategory", () => {
  it("returns everything when no category is selected", () => {
    expect(filterByCategory(items, null)).toHaveLength(4);
    expect(filterByCategory(items, undefined)).toHaveLength(4);
    expect(filterByCategory(items, "")).toHaveLength(4);
  });

  it("keeps a transaction that carries the category among several", () => {
    const ids = filterByCategory(items, "Food and Drinks").map((t) => t.id);
    expect(ids).toEqual(["food", "mixed"]);
  });

  it("maps Uncategorized to transactions with no categories at all", () => {
    // Uncategorized is a chart bucket, not a category any transaction carries. Matching it by
    // name returns nothing, which reads as a legitimate empty list rather than a bug.
    const ids = filterByCategory(items, UNCATEGORIZED).map((t) => t.id);
    expect(ids).toEqual(["unitemized"]);
  });

  it("does not treat an unitemized transaction as belonging to a real category", () => {
    expect(filterByCategory(items, "Other").map((t) => t.id)).toEqual(["mixed", "other"]);
  });

  it("returns nothing for a category no transaction carries", () => {
    expect(filterByCategory(items, "Health")).toEqual([]);
  });

  it("matches the stored key, not the display label", () => {
    // Chips render "Food & Drinks"; the stored key stays "Food and Drinks".
    expect(filterByCategory(items, "Food & Drinks")).toEqual([]);
    expect(filterByCategory(items, "Food and Drinks")).not.toEqual([]);
  });
});

describe("non-line-item slices", () => {
  // Tax and Tip are transaction-level amounts, not line-item categories, so no transaction
  // carries them. Filtering to nothing would claim there is no tax while the slice is on screen.
  it.each(["Tax", "Tip"])("leaves the list untouched for %s", (category) => {
    expect(filterByCategory(items, category)).toHaveLength(items.length);
  });

  it("reports Tax and Tip as unfilterable so the caller can explain", () => {
    expect(isFilterableCategory("Tax")).toBe(false);
    expect(isFilterableCategory("Tip")).toBe(false);
  });

  it("reports real categories and the unitemized bucket as filterable", () => {
    expect(isFilterableCategory("Food and Drinks")).toBe(true);
    expect(isFilterableCategory(UNCATEGORIZED)).toBe(true);
  });

  it("treats no selection as unfilterable", () => {
    expect(isFilterableCategory(null)).toBe(false);
  });
});
