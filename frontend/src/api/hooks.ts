import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "./client";
import type {
  Category,
  IngestRequest,
  IngestResult,
  ReceiptDraft,
  SpendingResponse,
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
