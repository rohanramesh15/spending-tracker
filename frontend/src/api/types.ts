/**
 * API response/request types — mirror backend/app/api/schemas.py.
 * (Later these can be auto-generated from the OpenAPI schema via `pnpm gen:api`.)
 * Money is integer cents everywhere.
 */

export type TransactionSource = "receipt" | "manual" | "plaid";
export type ReviewStatus = "confirmed" | "needs_review";

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
}
