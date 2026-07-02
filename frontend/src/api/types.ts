/**
 * API response/request types — mirror backend/app/api/schemas.py.
 * (Later these can be auto-generated from the OpenAPI schema via `pnpm gen:api`.)
 * Money is integer cents everywhere.
 */

export type TransactionSource = "receipt" | "manual" | "plaid";
export type ReviewStatus = "confirmed" | "needs_review";
export type Resolution = "merge" | "skip" | "replace" | "keep_both";

export interface Category {
  id: string;
  name: string;
  is_system: boolean;
}

export interface LineItem {
  id: string;
  position: number;
  raw_name: string;
  normalized_name: string | null;
  category_id: string | null;
  category_name: string | null;
  price_cents: number;
  quantity: string; // Decimal serialized as string
  unit_size: string | null;
  unit: string | null;
}

export interface TransactionListItem {
  id: string;
  vendor: string;
  purchased_on: string; // YYYY-MM-DD
  source: TransactionSource;
  total_cents: number;
  currency: string;
  review_status: ReviewStatus;
  item_count: number;
}

export interface TransactionDetail extends TransactionListItem {
  purchased_time: string | null;
  subtotal_cents: number | null;
  tax_cents: number;
  tip_cents: number;
  line_items: LineItem[];
}

export interface TransactionOut {
  id: string;
  vendor: string;
  purchased_on: string;
  source: TransactionSource;
  total_cents: number;
  currency: string;
  review_status: ReviewStatus;
}

export interface SpendingSlice {
  category: string;
  cents: number;
}

export interface SpendingResponse {
  start: string;
  end: string;
  total_cents: number;
  slices: SpendingSlice[];
}

export interface LineItemIn {
  raw_name: string;
  category_id?: string | null;
  price_cents: number;
  quantity?: number;
}

export interface IngestRequest {
  source: TransactionSource;
  vendor: string;
  purchased_on: string;
  subtotal_cents?: number | null;
  tax_cents?: number;
  tip_cents?: number;
  total_cents: number;
  currency?: string;
  line_items?: LineItemIn[];
  raw_extraction_json?: Record<string, unknown> | null;
  // Set only on the second call of an attended reconciliation (after the user picks in
  // the merge/skip/replace/keep-both dialog).
  resolution?: Resolution;
  matched_transaction_id?: string | null;
}

/** The existing transaction a fresh attended ingest collided with (plan §6.3). */
export interface ReconcileMatch {
  matched_transaction_id: string;
  vendor: string;
  purchased_on: string;
  source: TransactionSource;
  total_cents: number;
  item_count: number;
}

/** The ingest door's outcome. `needs_decision` carries `match` and writes nothing. */
export interface IngestResult {
  status:
    "created" | "resolved" | "skipped" | "needs_decision" | "needs_review" | "exists";
  transaction: TransactionOut | null;
  match: ReconcileMatch | null;
}

/** One side of a reconciliation review card (plan §6.3, user-flow §6). */
export interface ReviewTxn {
  id: string;
  vendor: string;
  purchased_on: string;
  source: TransactionSource;
  total_cents: number;
  review_status: ReviewStatus;
  item_count: number;
}

export interface Review {
  id: string;
  created_at: string;
  match_score: string | null; // Decimal serialized as string
  reason: string;
  incoming: ReviewTxn;
  matched: ReviewTxn;
}

export interface ReviewResolveResult {
  status: "resolved";
  resolution: Resolution;
  transaction_id: string;
}

// --- Bank sync (Plaid) --------------------------------------------------------
export type AccountStatus = "active" | "needs_reauth" | "disconnected";

export interface LinkedAccount {
  id: string;
  institution: string;
  status: AccountStatus;
  is_apple_card: boolean;
  last_synced_at: string | null;
}

export interface LinkTokenOut {
  link_token: string;
}

export interface SyncSummary {
  added: number;
  needs_review: number;
  removed: number;
}

export interface ExchangeResult {
  account: LinkedAccount;
  synced: SyncSummary;
}

export interface ImportSummary {
  imported: number;
  needs_review: number;
  duplicates: number;
  skipped: number;
}

// --- Recurring items (Phase 4) ------------------------------------------------
export interface PricePoint {
  purchased_on: string;
  unit_price_cents: number;
}

export interface RecurringItem {
  canonical_name: string;
  category_name: string | null;
  occurrences: number;
  avg_unit_price_cents: number;
  first_seen: string;
  last_seen: string;
  price_history: PricePoint[];
}

export interface ReceiptDraftItem {
  raw_name: string;
  normalized_name: string | null;
  category_id: string | null;
  category_name: string | null;
  price_cents: number;
  quantity: string;
}

export interface ReceiptDraft {
  vendor: string;
  purchased_on: string;
  subtotal_cents: number | null;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;
  currency: string;
  line_items: ReceiptDraftItem[];
  raw_extraction_json: Record<string, unknown>;
}
