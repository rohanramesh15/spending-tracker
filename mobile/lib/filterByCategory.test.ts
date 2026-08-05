import type { TransactionListItem } from "@shared/api/types";
import { filterByCategory, UNCATEGORIZED } from "@/lib/filterByCategory";

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
    tax_cents: 0,
    tip_cents: 0,
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

describe("transaction-level slices (Tax / Tip)", () => {
  // Tax and Tip are never in `categories` — they are transaction-level amounts (CLAUDE.md #8),
  // so they match on their own field. Before the list carried those fields this returned
  // nothing, and an empty list read as "you have no tax" while the slice sat on the chart.
  const withAmounts = [
    { ...txn("taxed", ["Food and Drinks"]), tax_cents: 50, tip_cents: 0 },
    { ...txn("tipped", ["Food and Drinks"]), tax_cents: 0, tip_cents: 200 },
    { ...txn("both", ["Other"]), tax_cents: 10, tip_cents: 10 },
    { ...txn("neither", ["Other"]), tax_cents: 0, tip_cents: 0 },
  ];

  it("matches transactions that actually carried tax", () => {
    expect(filterByCategory(withAmounts, "Tax").map((t) => t.id)).toEqual(["taxed", "both"]);
  });

  it("matches transactions that actually carried a tip", () => {
    expect(filterByCategory(withAmounts, "Tip").map((t) => t.id)).toEqual(["tipped", "both"]);
  });

  it("excludes a zero amount rather than counting the field's presence", () => {
    expect(filterByCategory(withAmounts, "Tax").map((t) => t.id)).not.toContain("neither");
  });

  it("does not confuse tax with a line-item category of the same transaction", () => {
    expect(filterByCategory(withAmounts, "Food and Drinks").map((t) => t.id)).toEqual([
      "taxed",
      "tipped",
    ]);
  });
});
