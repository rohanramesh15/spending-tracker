import type { IngestRequest } from "@shared/api/types";
import { dollarsToCents } from "@shared/lib/money";

export interface ItemRow {
  name: string;
  amount: string; // dollars, as typed
  categoryId: string | null;
}

export interface ManualEntryInput {
  mode: "quick" | "itemized";
  vendor: string;
  date: string;
  total: string;
  category: string | null;
  rows: ItemRow[];
  tax: string;
  tip: string;
}

/** Sum of the item rows, in integer cents. Unparseable rows contribute nothing. */
export function itemsTotalCents(rows: ItemRow[]): number {
  return rows.reduce((sum, r) => sum + (dollarsToCents(r.amount) ?? 0), 0);
}

/** Itemized total = items + tax + tip. The user never types this; it's always derived. */
export function itemizedTotalCents(input: Pick<ManualEntryInput, "rows" | "tax" | "tip">): number {
  return (
    itemsTotalCents(input.rows) + (dollarsToCents(input.tax) ?? 0) + (dollarsToCents(input.tip) ?? 0)
  );
}

/**
 * Build the ingest payload, or return a message explaining why it can't be built.
 *
 * Pure and separate from the screen so the validation and the cents arithmetic are tested
 * directly — this is the code path that decides what money reaches the database, and every
 * source goes through the same idempotent ingest door (CLAUDE.md #4).
 *
 * Quick mode deliberately stores ONE line item rather than an unitemized total: that makes the
 * chart treat it as itemized and attribute it to the chosen category, instead of dumping it
 * into "Uncategorized" (CLAUDE.md #6).
 */
export function buildIngestPayload(input: ManualEntryInput): IngestRequest | string {
  const vendor = input.vendor.trim();
  if (!vendor) return "Add a vendor.";

  if (input.mode === "quick") {
    const cents = dollarsToCents(input.total);
    if (cents === null || cents <= 0) return "Enter a valid total.";
    if (!input.category) return "Pick a category.";

    return {
      source: "manual",
      vendor,
      purchased_on: input.date,
      subtotal_cents: cents,
      total_cents: cents,
      line_items: [{ raw_name: vendor, category_id: input.category, price_cents: cents }],
    };
  }

  const items = input.rows.filter((r) => r.name.trim() && dollarsToCents(r.amount));
  if (items.length === 0) return "Add at least one item with a name and price.";

  const subtotal = itemsTotalCents(items);
  const taxCents = dollarsToCents(input.tax) ?? 0;
  const tipCents = dollarsToCents(input.tip) ?? 0;

  return {
    source: "manual",
    vendor,
    purchased_on: input.date,
    subtotal_cents: subtotal,
    tax_cents: taxCents,
    tip_cents: tipCents,
    total_cents: subtotal + taxCents + tipCents,
    line_items: items.map((r) => ({
      raw_name: r.name.trim(),
      category_id: r.categoryId,
      price_cents: dollarsToCents(r.amount) as number,
    })),
  };
}
