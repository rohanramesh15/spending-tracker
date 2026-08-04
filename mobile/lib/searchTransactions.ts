import { format } from "date-fns";

import type { TransactionListItem } from "@shared/api/types";
import { categoryLabel } from "@shared/lib/categories";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";

/**
 * Free-text search across a transaction's visible details.
 *
 * "Various details" in practice means the things a person actually remembers about a purchase:
 * who it was with, roughly when, roughly how much, and what kind of thing it was. All four are
 * searchable, in the forms they are DISPLAYED as well as the forms they are stored as — someone
 * who sees "Food & Drinks" on screen will type that, not the stored "Food and Drinks", and
 * someone who sees "$42.12" may type "42.12" or "42".
 *
 * Terms are ANDed: "kroger aug" finds Kroger purchases in August rather than everything matching
 * either. That is what a second word is for.
 */
export function searchTransactions(
  items: TransactionListItem[],
  query: string,
): TransactionListItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;

  return items.filter((t) => {
    const hay = haystack(t);
    return terms.every((term) => hay.includes(term));
  });
}

/**
 * Everything about one transaction, lowercased into a single string.
 *
 * Built per call rather than cached: the list is a personal ledger, not a search index, and a
 * cache keyed on a mutable row is a staleness bug waiting to happen for no measurable gain.
 */
function haystack(t: TransactionListItem): string {
  const date = parseISODate(t.purchased_on);
  const amount = formatCents(t.total_cents, t.currency);

  return [
    t.vendor,

    // Categories in both forms: the stored key and the label actually on screen.
    ...t.categories,
    ...t.categories.map(categoryLabel),
    t.tax_cents > 0 ? "tax" : "",
    t.tip_cents > 0 ? "tip" : "",

    // Amount as displayed ("$42.12"), and bare so "42.12" and "42" both hit.
    amount,
    amount.replace(/[^0-9.]/g, ""),

    // Dates in the forms a person might type: ISO, day-first, month name, weekday.
    t.purchased_on,
    format(date, "d MMM yyyy"),
    format(date, "MMMM"),
    format(date, "EEEE"),

    // Where it came from, and whether it still needs attention. Keeps "needs review" reachable
    // now that the filter chips are gone.
    t.source,
    t.review_status === "needs_review" ? "needs review" : "",
    t.pending ? "pending" : "",
    t.hidden ? "hidden" : "",
  ]
    .join(" ")
    .toLowerCase();
}
