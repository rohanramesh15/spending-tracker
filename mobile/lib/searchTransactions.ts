import { format } from "date-fns";

import type { TransactionListItem } from "@shared/api/types";
import { categoryLabel } from "@shared/lib/categories";
import { parseISODate } from "@shared/lib/dates";
import { formatCents } from "@shared/lib/money";

/**
 * Free-text search across a transaction's visible details, ranked by relevance.
 *
 * The problem this solves is permutations: someone types what they remember, in any order, with
 * any of the parts missing — "kroger", "kroger 42", "aug food", "42.12 tuesday". A plain
 * substring filter finds those but returns them flat, so the exact match sits wherever the date
 * order happens to put it.
 *
 * So terms are SCORED per field rather than merely matched:
 *
 *  - every term must hit something (strict AND) — otherwise "kroger july" would return all of
 *    July, and a second word is there to narrow, not to widen;
 *  - each term takes its BEST field score, so an ambiguous "14" counts once, as whichever of
 *    day-of-month / amount / vendor-word it fits best;
 *  - scores sum, so a transaction matching three terms outranks one matching three weakly;
 *  - ties break by recency, which is what "most relevant" means in a ledger.
 *
 * Fields are matched in their DISPLAYED forms as well as their stored ones: someone who sees
 * "Food & Drinks" types that, not the stored "Food and Drinks", and someone who sees "$42.12"
 * may type "42.12" or "42".
 */
export function searchTransactions(
  items: TransactionListItem[],
  query: string,
): TransactionListItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;

  const scored: { item: TransactionListItem; score: number }[] = [];
  for (const item of items) {
    const score = scoreTransaction(item, terms);
    if (score !== null) scored.push({ item, score });
  }

  return scored
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : b.item.purchased_on.localeCompare(a.item.purchased_on),
    )
    .map((s) => s.item);
}

/** Total relevance, or null if any term matches nothing at all. */
export function scoreTransaction(t: TransactionListItem, terms: string[]): number | null {
  let total = 0;
  for (const term of terms) {
    const best = bestTermScore(t, term);
    if (best === 0) return null;
    total += best;
  }
  return total;
}

/** Weights. Kept together so the relative importance of fields is legible in one place. */
const W = {
  vendorWord: 10,
  vendorPrefix: 6,
  vendorSubstring: 3,
  amountExact: 8,
  amountWhole: 6,
  amountPrefix: 3,
  categoryExact: 5,
  categoryPrefix: 4,
  categorySubstring: 2,
  datePart: 5,
  weekday: 4,
  dayOfMonth: 4,
  flag: 4,
  source: 3,
} as const;

function bestTermScore(t: TransactionListItem, term: string): number {
  return Math.max(
    vendorScore(t.vendor, term),
    amountScore(t, term),
    categoryScore(t, term),
    dateScore(t.purchased_on, term),
    flagScore(t, term),
  );
}

function vendorScore(vendor: string, term: string): number {
  const v = vendor.toLowerCase();
  const words = v.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.includes(term)) return W.vendorWord;
  if (words.some((w) => w.startsWith(term))) return W.vendorPrefix;
  return v.includes(term) ? W.vendorSubstring : 0;
}

function amountScore(t: TransactionListItem, term: string): number {
  // Only digits and a dot can be an amount; letting words through here would score "aug" as an
  // amount prefix of nothing and muddy the ranking.
  if (!/^\$?\d+(\.\d{1,2})?$/.test(term)) return 0;
  const typed = term.replace("$", "");

  const shown = formatCents(t.total_cents, t.currency).replace(/[^0-9.]/g, "");
  const whole = shown.split(".")[0];

  if (typed === shown) return W.amountExact;
  if (typed === whole) return W.amountWhole;
  return shown.startsWith(typed) ? W.amountPrefix : 0;
}

function categoryScore(t: TransactionListItem, term: string): number {
  const names = [...t.categories, ...t.categories.map(categoryLabel)].map((c) => c.toLowerCase());
  if (names.some((n) => n === term)) return W.categoryExact;
  if (names.some((n) => n.split(/[^a-z0-9]+/).some((w) => w && w.startsWith(term)))) {
    return W.categoryPrefix;
  }
  return names.some((n) => n.includes(term)) ? W.categorySubstring : 0;
}

function dateScore(purchasedOn: string, term: string): number {
  const d = parseISODate(purchasedOn);
  const month = format(d, "MMMM").toLowerCase();
  const weekday = format(d, "EEEE").toLowerCase();

  if (month === term || month.startsWith(term)) return W.datePart;
  if (format(d, "yyyy") === term) return W.datePart;
  if (purchasedOn.includes(term)) return W.datePart;
  if (weekday === term || weekday.startsWith(term)) return W.weekday;
  // Bare day-of-month, so "14 jul" works. Scored below an exact amount so an ambiguous number
  // lands on the amount when one matches exactly.
  if (/^\d{1,2}$/.test(term) && Number(term) === d.getDate()) return W.dayOfMonth;
  return 0;
}

function flagScore(t: TransactionListItem, term: string): number {
  if (t.tax_cents > 0 && "tax".startsWith(term)) return W.flag;
  if (t.tip_cents > 0 && "tip".startsWith(term)) return W.flag;
  if (t.review_status === "needs_review" && ("needs".startsWith(term) || "review".startsWith(term)))
    return W.flag;
  if (t.pending && "pending".startsWith(term)) return W.flag;
  if (t.hidden && "hidden".startsWith(term)) return W.flag;
  return t.source.toLowerCase().startsWith(term) ? W.source : 0;
}
