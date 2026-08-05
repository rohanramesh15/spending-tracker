import type { TransactionListItem } from "@shared/api/types";

/**
 * The pie's bucket for transactions that were never itemized. It is not a category the
 * classifier ever assigns, so it can't be matched by name (CLAUDE.md #6) — see below.
 */
export const UNCATEGORIZED = "Uncategorized";

/**
 * Slices backed by a transaction-level amount rather than a line-item category (CLAUDE.md #8).
 *
 * `TransactionListItem.categories` is line-item categories only, so these can never appear in
 * it. They are matched against their own amount field instead — which is why the list endpoint
 * carries `tax_cents`/`tip_cents`. Before it did, tapping the Tax slice matched nothing and
 * showed an empty list that read as "you have no tax" while the slice sat on screen.
 */
const AMOUNT_CATEGORIES: Record<string, (t: TransactionListItem) => boolean> = {
  Tax: (t) => t.tax_cents > 0,
  Tip: (t) => t.tip_cents > 0,
};

/** The transaction-level slices, for callers that need to label them. */
export const NON_ITEM_CATEGORIES = Object.keys(AMOUNT_CATEGORIES);

/**
 * Narrow a list to the transactions behind one pie slice.
 *
 * Two slices need special handling. Tax and Tip match on their amount field (above).
 * `Uncategorized` is likewise not a category any transaction carries; it is the
 * bucket unitemized transactions chart their total under. Matching it by name would return
 * nothing at all, so it maps to "has no categories" instead. Getting this wrong produces an
 * empty list that looks like a legitimate "no results" rather than a bug, which is why it is a
 * named function with tests rather than an inline `.filter`.
 *
 * A null/undefined category means no filter is applied.
 */
export function filterByCategory(
  items: TransactionListItem[],
  category: string | null | undefined,
): TransactionListItem[] {
  if (!category) return items;
  const byAmount = AMOUNT_CATEGORIES[category];
  if (byAmount) return items.filter(byAmount);
  if (category === UNCATEGORIZED) return items.filter((t) => t.categories.length === 0);
  return items.filter((t) => t.categories.includes(category));
}
