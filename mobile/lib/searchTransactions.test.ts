import type { TransactionListItem } from "@shared/api/types";
import { scoreTransaction, searchTransactions } from "@/lib/searchTransactions";

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

describe("ranking", () => {
  // The point of scoring: with a vague query, the best match must lead rather than landing
  // wherever date order happens to put it.
  const ranked = [
    txn({ id: "exact", vendor: "Kroger", total_cents: 4212, purchased_on: "2026-08-02" }),
    txn({ id: "other-amount", vendor: "Kroger", total_cents: 999, purchased_on: "2026-08-20" }),
    txn({ id: "mentions-42", vendor: "Corner Store", total_cents: 4200, purchased_on: "2026-08-25" }),
  ];

  it("puts the transaction matching every term most strongly first", () => {
    const [first] = searchTransactions(ranked, "kroger 42.12");
    expect(first.id).toBe("exact");
  });

  it("ranks an exact amount above a partial one", () => {
    const order = searchTransactions(ranked, "42").map((t) => t.id);
    // "42.12" is an exact hit; 4200 -> "42.00" matches on the whole-dollar part.
    expect(order.indexOf("mentions-42")).toBeLessThan(order.indexOf("exact"));
  });

  it("ranks a whole-word vendor hit above a substring one", () => {
    const items = [
      txn({ id: "substring", vendor: "Krogerville Deli" }),
      txn({ id: "word", vendor: "Kroger" }),
    ];
    expect(searchTransactions(items, "kroger")[0].id).toBe("word");
  });

  it("breaks ties by recency, which is what relevance means in a ledger", () => {
    const items = [
      txn({ id: "older", vendor: "Kroger", purchased_on: "2026-01-05" }),
      txn({ id: "newer", vendor: "Kroger", purchased_on: "2026-08-05" }),
    ];
    expect(searchTransactions(items, "kroger").map((t) => t.id)).toEqual(["newer", "older"]);
  });

  it("scores more matching terms above fewer", () => {
    const items = [
      txn({ id: "two", vendor: "Kroger", purchased_on: "2026-08-02", categories: ["Health"] }),
      txn({ id: "one", vendor: "Kroger Express", purchased_on: "2026-08-02", categories: ["Other"] }),
    ];
    expect(searchTransactions(items, "kroger health")).toHaveLength(1);
    expect(searchTransactions(items, "kroger")[0].id).toBe("two");
  });

  it("counts an ambiguous number once, not once per field it could be", () => {
    // "2" is a plausible day-of-month AND an amount prefix. Double-counting it would let a
    // coincidence outrank a real match.
    const items = [txn({ id: "a", vendor: "Kroger", purchased_on: "2026-08-02", total_cents: 200 })];
    const withBoth = scoreTransaction(items[0], ["2"]);
    const vendorOnly = scoreTransaction(items[0], ["kroger"]);
    expect(withBoth).toBeLessThan(vendorOnly! * 2);
  });

  it("still excludes a transaction when any single term misses", () => {
    expect(searchTransactions(ranked, "kroger nonsense")).toEqual([]);
  });

  it("does not treat a word as an amount", () => {
    // "aug" must not score as an amount prefix of nothing and muddy the ranking.
    expect(searchTransactions(ranked, "aug")).toHaveLength(3);
  });
});
