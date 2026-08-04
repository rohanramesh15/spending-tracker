import type { TransactionListItem } from "@shared/api/types";

/**
 * The pie's bucket for transactions that were never itemized. It is not a category the
 * classifier ever assigns, so it can't be matched by name (CLAUDE.md #6) — see below.
 */
export const UNCATEGORIZED = "Uncategorized";

/**
 * Slices that are NOT line-item categories, so no transaction can ever be tagged with them.
 *
 * Tax and Tip are stored at transaction level (`tax_cents` / `tip_cents` on TransactionDetail)
 * and charted as their own slices (CLAUDE.md #8). `TransactionListItem.categories` is explicitly
 * "distinct LINE-ITEM categories", so filtering the list by "Tax" matches nothing — the list
 * simply cannot answer the question with the fields it carries.
 *
 * Rather than render an empty list that reads as "you have no tax" (which is false, the slice is
 * right there), these slices are treated as unfilterable and the caller explains why.
 */
export const NON_ITEM_CATEGORIES = ["Tax", "Tip"];

/** Whether tapping this slice can meaningfully narrow the transaction list. */
export function isFilterableCategory(category: string | null | undefined): boolean {
  return !!category && !NON_ITEM_CATEGORIES.includes(category);
}

/**
 * Narrow a list to the transactions behind one pie slice.
 *
 * The subtlety is `Uncategorized`. It is not a category any transaction carries; it is the
 * bucket unitemized transactions chart their total under. Matching it by name would return
 * nothing at all, so it maps to "has no categories" instead. Getting this wrong produces an
 * empty list that looks like a legitimate "no results" rather than a bug, which is why it is a
 * named function with tests rather than an inline `.filter`.
 *
 * A null/undefined category, or a non-line-item slice (Tax/Tip), means no filter is applied.
 */
export function filterByCategory(
  items: TransactionListItem[],
  category: string | null | undefined,
): TransactionListItem[] {
  if (!category) return items;
  // Unfilterable slices leave the list alone; narrowing to nothing would be a lie.
  if (!isFilterableCategory(category)) return items;
  if (category === UNCATEGORIZED) return items.filter((t) => t.categories.length === 0);
  return items.filter((t) => t.categories.includes(category));
}
