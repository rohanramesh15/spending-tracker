import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { QueryClient, DehydratedState } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { subMonths } from "date-fns";
import { toISODate } from "./dates";
import type { TransactionListItem } from "@/api/types";

type DehydratedQuery = DehydratedState["queries"][number];

// Bump this whenever a cached response SHAPE changes in a breaking way (e.g. a query key's
// response type gains a required field) — old persisted entries are discarded instead of
// causing a runtime error on hydrate.
export const QUERY_CACHE_BUSTER = "v1";
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60_000; // ignore a persisted cache older than this

// `useTransactions()` is called with no date range anywhere in the app (TransactionsPage
// fetches full history), so it's the one cached query that grows unboundedly with lifetime
// transaction count. Trim it to a recent window before writing to disk — the in-memory
// cache and the next network fetch are untouched, so this only shrinks what's on disk.
const TRANSACTIONS_PERSIST_WINDOW_MONTHS = 6;

export function trimOldTransactions(client: PersistedClient): PersistedClient {
  const cutoff = toISODate(subMonths(new Date(), TRANSACTIONS_PERSIST_WINDOW_MONTHS));
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((query: DehydratedQuery) => {
        if (query.queryKey[0] !== "transactions" || !Array.isArray(query.state.data)) {
          return query;
        }
        return {
          ...query,
          state: {
            ...query.state,
            data: (query.state.data as TransactionListItem[]).filter(
              (t) => t.purchased_on >= cutoff,
            ),
          },
        };
      }),
    },
  };
}

// createSyncStoragePersister (@tanstack/query-sync-storage-persister) is deprecated as of
// this TanStack Query version in favor of this async persister wrapping a sync Storage —
// localStorage's calls resolve immediately, so restore-before-first-paint behavior is
// unchanged; PersistQueryClientProvider already gates queries on isRestoring internally.
export const queryPersister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: "spending-tracker-cache",
  serialize: (client) => JSON.stringify(trimOldTransactions(client)),
});

/** Wipe both the in-memory and persisted cache — call on sign-out, and on sign-in as a
 *  different user (see AuthGate), so one person's cached financial data can never be
 *  visible to the next person on a shared device. */
export function clearPersistedCache(queryClient: QueryClient): void {
  queryClient.clear();
  queryPersister.removeClient();
}
