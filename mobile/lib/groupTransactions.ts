import type { TransactionListItem } from "@shared/api/types";

/**
 * Group transactions into day sections, newest day first.
 *
 * Sorting compares the ISO date STRINGS rather than parsed Dates: `purchased_on` is a local
 * calendar date (CLAUDE.md #2), and YYYY-MM-DD sorts correctly lexicographically, so this
 * avoids constructing Dates that could shift across a timezone boundary.
 *
 * Pure and separate from the screen so the ordering is testable without rendering a list.
 */
export function groupByDay(
  transactions: TransactionListItem[],
  /**
   * Keep the input's order instead of sorting days newest-first.
   *
   * Search results arrive ranked by relevance; re-sorting them by date would throw that ranking
   * away and put the best match wherever its date happens to fall — which is the whole thing
   * the scoring exists to avoid. Days then appear in the order their best match did.
   */
  { preserveOrder = false }: { preserveOrder?: boolean } = {},
): { day: string; items: TransactionListItem[] }[] {
  const groups = new Map<string, TransactionListItem[]>();

  for (const t of transactions) {
    const arr = groups.get(t.purchased_on) ?? [];
    arr.push(t);
    groups.set(t.purchased_on, arr);
  }

  const entries = [...groups.entries()];
  // Map preserves insertion order, so the unsorted path already reflects the input's ranking.
  if (!preserveOrder) entries.sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return entries.map(([day, items]) => ({ day, items }));
}
