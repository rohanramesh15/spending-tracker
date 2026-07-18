import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload } from "./client";
import type {
  Card,
  AppNotification,
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
  RewardProfile,
  RewardsOptimization,
  SpendingResponse,
  Subscription,
  SubscriptionStatus,
  SubscriptionSummary,
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

// --- Rewards optimizer (rewards-optimizer-plan §3, v1) -----------------------------------
export function useCards() {
  return useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetch<Card[]>("/api/cards"),
  });
}

export function useRewardProfiles() {
  return useQuery({
    queryKey: ["reward-profiles"],
    queryFn: () => apiFetch<RewardProfile[]>("/api/rewards/profiles"),
    staleTime: 60 * 60_000, // seed catalog rarely changes
  });
}

export function useRewardsOptimization(windowDays = 90) {
  return useQuery({
    queryKey: ["rewards-optimization", windowDays],
    queryFn: () =>
      apiFetch<RewardsOptimization>(`/api/rewards/optimization?window_days=${windowDays}`),
  });
}

export function useSetCardProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, rewardProfileKey }: { cardId: string; rewardProfileKey: string }) =>
      apiFetch<Card>(`/api/cards/${cardId}/profile`, {
        method: "POST",
        body: JSON.stringify({ reward_profile_key: rewardProfileKey }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["rewards-optimization"] });
    },
  });
}

export function useSubscriptions(includeHidden = false) {
  return useQuery({
    queryKey: ["subscriptions", includeHidden],
    queryFn: () =>
      apiFetch<Subscription[]>(
        `/api/subscriptions${includeHidden ? "?include_hidden=true" : ""}`,
      ),
  });
}

export function useSubscriptionSummary(months = 6) {
  return useQuery({
    queryKey: ["subscription-summary", months],
    queryFn: () =>
      apiFetch<SubscriptionSummary>(`/api/subscriptions/summary?months=${months}`),
  });
}

export function useRecomputeSubscriptions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Subscription[]>("/api/subscriptions/recompute", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function useSetSubscriptionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: SubscriptionStatus }) =>
      apiFetch<Subscription>(`/api/subscriptions/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: ["notifications", unreadOnly],
    queryFn: () =>
      apiFetch<AppNotification[]>(
        `/api/notifications${unreadOnly ? "?unread_only=true" : ""}`,
      ),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<AppNotification>(`/api/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ marked: number }>("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
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

/** Update-mode Link token for an existing connection (reconnect / add accounts — no new Item). */
export function useCreateUpdateLinkToken() {
  return useMutation({
    mutationFn: (linkedAccountId: string) =>
      apiFetch<LinkTokenOut>("/api/plaid/link-token/update", {
        method: "POST",
        body: JSON.stringify({ linked_account_id: linkedAccountId }),
      }),
  });
}

/** After a successful update-mode Link: reactivate the account + sync (server-side). */
export function useAccountReconnected() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) =>
      apiFetch<SyncSummary>(`/api/plaid/accounts/${accountId}/reconnected`, {
        method: "POST",
        body: "{}",
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
