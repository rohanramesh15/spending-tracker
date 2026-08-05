import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUpload, appendUploadFile } from "./client";
import type { UploadFilePart } from "./client";
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
    staleTime: Infinity, // fixed taxonomy; only changes via a migration
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
    staleTime: 60_000, // bank sync can land anytime; not so short it thrashes
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: ["transaction", id],
    queryFn: () => apiFetch<TransactionDetail>(`/api/transactions/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useSpending(start: string, end: string) {
  return useQuery({
    queryKey: ["spending", start, end],
    queryFn: () =>
      apiFetch<SpendingResponse>(`/api/insights/spending?start=${start}&end=${end}`),
    staleTime: 60_000, // mirrors transactions — same underlying data
  });
}

// --- Rewards optimizer (rewards-optimizer-plan §3, v1) -----------------------------------
export function useCards() {
  return useQuery({
    queryKey: ["cards"],
    queryFn: () => apiFetch<Card[]>("/api/cards"),
    staleTime: 5 * 60_000, // changes only on connect/reconnect; writes already invalidate explicitly
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
    staleTime: 5 * 60_000, // derived/computed insight, doesn't need transaction-level freshness
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
    staleTime: 5 * 60_000, // recomputed server-side once daily; user-triggered recompute already invalidates
  });
}

export function useSubscriptionSummary(months = 6) {
  return useQuery({
    queryKey: ["subscription-summary", months],
    queryFn: () =>
      apiFetch<SubscriptionSummary>(`/api/subscriptions/summary?months=${months}`),
    staleTime: 5 * 60_000,
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
    mutationFn: (file: UploadFilePart) => {
      const form = new FormData();
      appendUploadFile(form, "file", file);
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
    staleTime: 5 * 60_000, // changes only on connect/reconnect; writes already invalidate it explicitly
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
    mutationFn: (file: UploadFilePart) => {
      const form = new FormData();
      appendUploadFile(form, "file", file);
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

export function useUpdateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      vendor: string;
      purchased_on: string;
      tax_cents: number;
      tip_cents: number;
    }) =>
      apiFetch<TransactionDetail>(`/api/transactions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: ["transaction", id] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}

export function useUpdateLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      itemId,
      ...body
    }: {
      transactionId: string;
      itemId: string;
      normalized_name: string;
      category_id: string | null;
      price_cents: number;
    }) =>
      apiFetch<TransactionDetail>(`/api/transactions/${transactionId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_result, { transactionId }) => {
      qc.invalidateQueries({ queryKey: ["transaction", transactionId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}

export function useDeleteLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ transactionId, itemId }: { transactionId: string; itemId: string }) =>
      apiFetch<TransactionDetail>(`/api/transactions/${transactionId}/items/${itemId}`, {
        method: "DELETE",
      }),
    onSuccess: (_result, { transactionId }) => {
      qc.invalidateQueries({ queryKey: ["transaction", transactionId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}

/** Hide/unhide a line item — it stays in the list but drops out of every spending total. */
export function useSetLineItemHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      itemId,
      hidden,
    }: {
      transactionId: string;
      itemId: string;
      hidden: boolean;
    }) =>
      apiFetch<TransactionDetail>(`/api/transactions/${transactionId}/items/${itemId}/hide`, {
        method: "POST",
        body: JSON.stringify({ hidden }),
      }),
    onSuccess: (_result, { transactionId }) => {
      qc.invalidateQueries({ queryKey: ["transaction", transactionId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}

/** Hide/unhide a whole purchase — stays in the ledger, drops out of pie charts. */
export function useSetTransactionHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      apiFetch<TransactionDetail>(`/api/transactions/${id}/hide`, {
        method: "POST",
        body: JSON.stringify({ hidden }),
      }),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: ["transaction", id] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["spending"] });
    },
  });
}
