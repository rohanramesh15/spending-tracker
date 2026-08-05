import { buildIngestPayload, itemizedTotalCents, type ManualEntryInput } from "@/lib/manualEntry";

function input(overrides: Partial<ManualEntryInput> = {}): ManualEntryInput {
  return {
    mode: "quick",
    vendor: "Kroger",
    date: "2026-03-02",
    total: "42.12",
    category: "cat-food",
    rows: [],
    tax: "",
    tip: "",
    ...overrides,
  };
}

describe("buildIngestPayload — quick mode", () => {
  it("stores a single line item so the chart attributes it to the chosen category", () => {
    // An unitemized total would chart under "Uncategorized" (CLAUDE.md #6); quick entry has a
    // category, so it must be itemized to be counted correctly.
    const payload = buildIngestPayload(input());
    expect(payload).toMatchObject({
      source: "manual",
      vendor: "Kroger",
      total_cents: 4212,
      subtotal_cents: 4212,
      line_items: [{ raw_name: "Kroger", category_id: "cat-food", price_cents: 4212 }],
    });
  });

  it("rejects a missing vendor", () => {
    expect(buildIngestPayload(input({ vendor: "  " }))).toBe("Add a vendor.");
  });

  it("rejects a zero, negative or unparseable total", () => {
    expect(buildIngestPayload(input({ total: "0" }))).toBe("Enter a valid total.");
    expect(buildIngestPayload(input({ total: "-5" }))).toBe("Enter a valid total.");
    expect(buildIngestPayload(input({ total: "abc" }))).toBe("Enter a valid total.");
  });

  it("rejects a missing category", () => {
    expect(buildIngestPayload(input({ category: null }))).toBe("Pick a category.");
  });

  it("trims the vendor in both the header and the line item", () => {
    const payload = buildIngestPayload(input({ vendor: "  Kroger  " }));
    expect(payload).toMatchObject({ vendor: "Kroger", line_items: [{ raw_name: "Kroger" }] });
  });
});

describe("buildIngestPayload — itemized mode", () => {
  const itemized = () =>
    input({
      mode: "itemized",
      rows: [
        { name: "Milk", amount: "3.49", categoryId: "cat-food" },
        { name: "Soap", amount: "5.00", categoryId: "cat-home" },
      ],
      tax: "0.68",
      tip: "1.00",
    });

  it("derives the total from items plus tax and tip", () => {
    // 349 + 500 + 68 + 100
    expect(buildIngestPayload(itemized())).toMatchObject({
      subtotal_cents: 849,
      tax_cents: 68,
      tip_cents: 100,
      total_cents: 1017,
    });
  });

  it("drops rows missing a name or a price rather than sending empty items", () => {
    const payload = buildIngestPayload(
      input({
        mode: "itemized",
        rows: [
          { name: "Milk", amount: "3.49", categoryId: null },
          { name: "", amount: "9.99", categoryId: null },
          { name: "Ghost", amount: "", categoryId: null },
        ],
      }),
    );
    expect(payload).toMatchObject({ total_cents: 349 });
    expect((payload as { line_items: unknown[] }).line_items).toHaveLength(1);
  });

  it("rejects an itemized entry with no usable rows", () => {
    expect(buildIngestPayload(input({ mode: "itemized", rows: [] }))).toBe(
      "Add at least one item with a name and price.",
    );
  });

  it("treats blank tax and tip as zero, never NaN", () => {
    const payload = buildIngestPayload(
      input({ mode: "itemized", rows: [{ name: "Milk", amount: "1.00", categoryId: null }] }),
    );
    expect(payload).toMatchObject({ tax_cents: 0, tip_cents: 0, total_cents: 100 });
  });

  it("rounds to the nearest cent so floats never leak into stored money", () => {
    // 0.1 + 0.2 in floating point is 0.30000000000000004 (CLAUDE.md #1).
    const payload = buildIngestPayload(
      input({
        mode: "itemized",
        rows: [
          { name: "A", amount: "0.10", categoryId: null },
          { name: "B", amount: "0.20", categoryId: null },
        ],
      }),
    );
    expect(payload).toMatchObject({ total_cents: 30 });
  });
});

describe("itemizedTotalCents", () => {
  it("is the live total shown while typing", () => {
    expect(
      itemizedTotalCents({
        rows: [{ name: "A", amount: "10.00", categoryId: null }],
        tax: "1.00",
        tip: "2.00",
      }),
    ).toBe(1300);
  });
});
