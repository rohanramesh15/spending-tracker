import type { TransactionListItem } from "@shared/api/types";
import { searchTransactions } from "@/lib/searchTransactions";

function txn(overrides: Partial<TransactionListItem> = {}): TransactionListItem {
  return {
    id: "t1",
    vendor: "Kroger",
    purchased_on: "2026-08-02",
    source: "manual",
    total_cents: 4212,
    currency: "USD",
    review_status: "confirmed",
    item_count: 2,
    categories: ["Food and Drinks"],
    tax_cents: 0,
    tip_cents: 0,
    hidden: false,
    pending: false,
    ...overrides,
  };
}

const items = [
  txn({ id: "kroger", vendor: "Kroger", total_cents: 4212, purchased_on: "2026-08-02" }),
  txn({
    id: "cvs",
    vendor: "CVS pharmacy",
    categories: ["Health"],
    total_cents: 1180,
    tax_cents: 90,
    purchased_on: "2026-07-14",
  }),
  txn({
    id: "zelle",
    vendor: "Zelle Transfer",
    categories: ["Other"],
    total_cents: 1500,
    purchased_on: "2026-08-03",
    review_status: "needs_review",
  }),
];

const ids = (q: string) => searchTransactions(items, q).map((t) => t.id);

describe("searchTransactions", () => {
  it("returns everything for an empty or whitespace query", () => {
    expect(searchTransactions(items, "")).toHaveLength(3);
    expect(searchTransactions(items, "   ")).toHaveLength(3);
  });

  it("matches a vendor, case-insensitively and on a partial word", () => {
    expect(ids("kro")).toEqual(["kroger"]);
    expect(ids("PHARMACY")).toEqual(["cvs"]);
  });

  it("matches a category by its stored key", () => {
    expect(ids("Health")).toEqual(["cvs"]);
  });

  it("matches a category by the label actually shown on screen", () => {
    // The row displays "Food & Drinks"; the stored key is "Food and Drinks". Someone types what
    // they can see.
    expect(ids("Food & Drinks")).toEqual(["kroger"]);
  });

  it("matches an amount as displayed, and bare", () => {
    expect(ids("$42.12")).toEqual(["kroger"]);
    expect(ids("42.12")).toEqual(["kroger"]);
    expect(ids("11.80")).toEqual(["cvs"]);
  });

  it("matches a partial amount", () => {
    expect(ids("15")).toContain("zelle");
  });

  it("matches a date as ISO, and the way it is written on screen", () => {
    expect(ids("2026-07-14")).toEqual(["cvs"]);
    expect(ids("14 Jul")).toEqual(["cvs"]);
  });

  it("matches a month or weekday name", () => {
    expect(ids("July")).toEqual(["cvs"]);
    expect(ids("august").sort()).toEqual(["kroger", "zelle"]);
  });

  it("finds transactions that carried tax", () => {
    // Tax is transaction-level, not a category, so it is only findable if searched deliberately.
    expect(ids("tax")).toEqual(["cvs"]);
  });

  it("keeps needs-review reachable now that the filter chips are gone", () => {
    expect(ids("needs review")).toEqual(["zelle"]);
  });

  it("ANDs multiple terms rather than ORing them", () => {
    // "kroger august" should not also return every other August transaction.
    expect(ids("kroger august")).toEqual(["kroger"]);
  });

  it("returns nothing when the terms can't all be satisfied", () => {
    expect(ids("kroger july")).toEqual([]);
  });

  it("returns nothing for a term that matches no transaction", () => {
    expect(ids("nonsense")).toEqual([]);
  });

  it("ignores extra whitespace between terms", () => {
    expect(ids("  kroger    august  ")).toEqual(["kroger"]);
  });

  it("does not mutate or reorder the input", () => {
    const before = items.map((t) => t.id);
    searchTransactions(items, "a");
    expect(items.map((t) => t.id)).toEqual(before);
  });
});
