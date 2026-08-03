import { QueryClient } from "@tanstack/react-query";
import type { QueryKey, QueryState } from "@tanstack/react-query";
import type { Persister, PersistedClient } from "@tanstack/react-query-persist-client";
import { subMonths } from "date-fns";
import { describe, expect, it, vi } from "vitest";
import { clearPersistedCache, trimOldTransactions } from "./queryPersistence";
import { toISODate } from "./dates";
import type { TransactionListItem } from "../api/types";

describe("clearPersistedCache", () => {
  it("clears both the in-memory query cache and the persisted storage", () => {
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, "clear");
    // Storage-agnostic here: the platform binding (localStorage vs AsyncStorage) is tested
    // in each app; this pins that BOTH sides of the wipe happen, which is the privacy rule.
    const persister = {
      persistClient: vi.fn(),
      restoreClient: vi.fn(),
      removeClient: vi.fn(),
    } as unknown as Persister;

    clearPersistedCache(queryClient, persister);

    expect(clearSpy).toHaveBeenCalledOnce();
    expect(persister.removeClient).toHaveBeenCalledOnce();
  });
});

function query(queryKey: QueryKey, data: unknown) {
  return {
    queryHash: JSON.stringify(queryKey),
    queryKey,
    state: {
      data,
      dataUpdateCount: 1,
      dataUpdatedAt: Date.now(),
      error: null,
      errorUpdateCount: 0,
      errorUpdatedAt: 0,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      fetchMeta: null,
      isInvalidated: false,
      status: "success",
      fetchStatus: "idle",
    } as QueryState,
  };
}

function client(queries: ReturnType<typeof query>[]): PersistedClient {
  return {
    timestamp: Date.now(),
    buster: "v1",
    clientState: { queries, mutations: [] },
  };
}

function txn(overrides: Partial<TransactionListItem> = {}): TransactionListItem {
  return {
    id: "t1",
    vendor: "Store",
    purchased_on: "2026-01-01",
    source: "manual",
    total_cents: 100,
    currency: "USD",
    review_status: "confirmed",
    item_count: 0,
    categories: [],
    hidden: false,
    pending: false,
    ...overrides,
  };
}

describe("trimOldTransactions", () => {
  it("drops transactions older than the persist window, keeps recent ones", () => {
    const recent = txn({ id: "recent", purchased_on: toISODate(subMonths(new Date(), 1)) });
    const old = txn({ id: "old", purchased_on: toISODate(subMonths(new Date(), 12)) });
    const result = trimOldTransactions(
      client([query(["transactions", null, null], [recent, old])]),
    );

    const data = result.clientState.queries[0].state.data as TransactionListItem[];
    expect(data.map((t) => t.id)).toEqual(["recent"]);
  });

  it("leaves non-transactions queries untouched", () => {
    const categories = [{ id: "c1", name: "Groceries" }];
    const result = trimOldTransactions(client([query(["categories"], categories)]));

    expect(result.clientState.queries[0].state.data).toBe(categories);
  });

  it("leaves a transactions query with non-array data untouched (e.g. still loading)", () => {
    const result = trimOldTransactions(client([query(["transactions", null, null], undefined)]));

    expect(result.clientState.queries[0].state.data).toBeUndefined();
  });
});
