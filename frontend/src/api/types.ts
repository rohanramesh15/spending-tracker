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
  categories: string[]; // distinct line-item categories, for row chips
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

export type Cadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "semiannual"
  | "annual";

export type SubscriptionType =
  | "streaming"
  | "music"
  | "software"
  | "gaming"
  | "news"
  | "fitness"
  | "cloud"
  | "insurance"
  | "utility"
  | "telecom"
  | "membership"
  | "other";

export type SubscriptionStatus = "detected" | "confirmed" | "dismissed" | "cancelled";

export interface Subscription {
  id: string | null; // the stored row id (v3); null only for compute-on-read fallbacks
  merchant: string;
  display_name: string;
  type: SubscriptionType | null; // v2 LLM enrichment; null if no key configured
  amount_cents: number;
  cadence: Cadence;
  monthly_cost_cents: number;
  occurrences: number;
  first_charged_on: string; // YYYY-MM-DD
  last_charged_on: string;
  next_charge_on: string;
  confidence: number; // 0.0–1.0
  status: SubscriptionStatus; // v3 lifecycle
}

export interface SubscriptionTypeBreakdown {
  type: string;
  monthly_cents: number;
  count: number;
}

export interface SubscriptionTrendPoint {
  month: string; // YYYY-MM
  cents: number;
}

export interface SubscriptionSummary {
  total_monthly_cents: number;
  annualized_cents: number;
  active_count: number;
  by_type: SubscriptionTypeBreakdown[];
  trend: SubscriptionTrendPoint[];
}

export type NotificationKind = "new" | "price_increased" | "upcoming" | "likely_cancelled";

// Named AppNotification to avoid shadowing the DOM `Notification` global.
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  subscription_id: string | null;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
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

export interface AccountSyncResult {
  account_id: string;
  institution: string;
  status: string;
  added: number;
  needs_review: number;
  removed: number;
  skipped: number;
  needs_attention: boolean;
  message: string | null;
}

export interface SyncSummary {
  added: number;
  needs_review: number;
  removed: number;
  accounts: AccountSyncResult[];
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

// (Recurring-items + cheaper-store-finder types removed 2026-07-17.)

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

// --- Rewards optimizer (rewards-optimizer-plan §3, v1) -----------------------------------
export interface Card {
  id: string;
  institution: string;
  name: string | null;
  mask: string | null;
  subtype: string | null;
  reward_profile_key: string | null;
  reward_profile_source: string | null;
  reward_profile_name: string | null;
  needs_confirmation: boolean;
}

export interface RewardProfile {
  key: string;
  display_name: string;
  issuer: string;
  base_rate: number;
  category_rates: Record<string, number>;
  points_value_cents: number;
  verified: boolean;
  notes: string | null;
}

export interface RewardRecommendation {
  reward_category: string;
  spend_cents: number;
  annualized_spend_cents: number;
  best_card_key: string;
  best_card_name: string;
  best_rate: number;
  est_annual_reward_cents: number;
  // v2 (actual-usage) — null in v1:
  current_card_name: string | null;
  current_rate: number | null;
  est_annual_missed_cents: number | null;
}

export interface RewardsOptimization {
  window_days: number;
  cards: Card[];
  recommendations: RewardRecommendation[];
  total_est_annual_reward_cents: number;
  // v2: real rewards left on the table vs the cards actually used (null until any
  // card-attributed spend exists).
  total_missed_annual_cents: number | null;
  unmatched_card_count: number;
  top_move: string | null;
  points_assumption_note: string;
  spend_scope_note: string;
}
