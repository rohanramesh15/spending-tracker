import type { TransactionListItem } from "@shared/api/types";

/**
 * The pie's bucket for transactions that were never itemized. It is not a category the
 * classifier ever assigns, so it can't be matched by name (CLAUDE.md #6) — see below.
 */
export const UNCATEGORIZED = "Uncategorized";

/**
 * Narrow a list to the transactions behind one pie slice.
 *
 * The subtlety is `Uncategorized`. It is not a category any transaction carries; it is the
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
  if (category === UNCATEGORIZED) return items.filter((t) => t.categories.length === 0);
  return items.filter((t) => t.categories.includes(category));
}
