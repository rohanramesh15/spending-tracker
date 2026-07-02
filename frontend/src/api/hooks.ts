import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "./client";
import type {
  Category,
  ExchangeResult,
  ImportSummary,
  IngestRequest,
  IngestResult,
  LinkedAccount,
  LinkTokenOut,
  ReceiptDraft,
  Resolution,
  Review,
  ReviewResolveResult,
  SpendingResponse,
  SyncSummary,
  TransactionDetail,
  TransactionListItem,
} from "./types";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/api/categories"),
    staleTime: 5 * 60_000, // taxonomy rarely changes
  });
}

export function useTransactions(range?: { start?: string; end?: string }) {
  const params = new URLSearchParams();
  if (range?.start) params.set("start", range.start);
  if (range?.end) params.set("end", range.end);
  const qs = params.toString();
  return useQuery({
    queryKey: ["transactions", range?.start ?? null, range?.end ?? null],
    queryFn: () =>
      apiFetch<TransactionListItem[]>(`/api/transactions${qs ? `?${qs}` : ""}`),
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: ["transaction", id],
    queryFn: () => apiFetch<TransactionDetail>(`/api/transactions/${id}`),
    enabled: !!id,
  });
}

export function useSpending(start: string, end: string) {
  return useQuery({
    queryKey: ["spending", start, end],
    queryFn: () =>
      apiFetch<SpendingResponse>(`/api/insights/spending?start=${start}&end=${end}`),
  });
}

export function useIngest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IngestRequest) =>
      apiFetch<IngestResult>("/api/ingest", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (result) => {
      // needs_decision writes nothing; the others change the ledger/chart.
      if (result.status === "needs_decision") return;
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}

export function useExtractReceipt() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<ReceiptDraft>("/api/receipts/extract", form);
    },
  });
}

export function useReviews() {
  return useQuery({
    queryKey: ["reviews"],
    queryFn: () => apiFetch<Review[]>("/api/reviews"),
  });
}

export function useResolveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reviewId,
      resolution,
    }: {
      reviewId: string;
      resolution: Resolution;
    }) =>
      apiFetch<ReviewResolveResult>(`/api/reviews/${reviewId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution }),
      }),
    onSuccess: () => {
      // Resolving drains the queue and moves the transaction into the charts.
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}

// --- Bank sync (Plaid) --------------------------------------------------------

export function useLinkedAccounts() {
  return useQuery({
    queryKey: ["linked-accounts"],
    queryFn: () => apiFetch<LinkedAccount[]>("/api/plaid/accounts"),
  });
}

export function useCreateLinkToken() {
  return useMutation({
    mutationFn: () =>
      apiFetch<LinkTokenOut>("/api/plaid/link-token", { method: "POST", body: "{}" }),
  });
}

/** Exchange Plaid Link's public_token for a stored Item; the initial sync runs server-side. */
export function useExchangePublicToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (public_token: string) =>
      apiFetch<ExchangeResult>("/api/plaid/exchange", {
        method: "POST",
        body: JSON.stringify({ public_token }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["linked-accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}

export function useSyncBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<SyncSummary>("/api/plaid/sync", { method: "POST", body: "{}" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["linked-accounts"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}

/** Apple Card CSV import → the ingest door (matches land in the review queue). */
export function useImportAppleCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload<ImportSummary>("/api/import/apple-card", form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
      qc.invalidateQueries({ queryKey: ["linked-accounts"] });
    },
  });
}

export function useDeleteTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}
