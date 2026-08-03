import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import {
  createQueryPersister,
  clearPersistedCache as clearPersistedCacheWith,
} from "@shared/lib/queryPersistence";

/**
 * Native binding for the shared query persister: AsyncStorage as the storage backend.
 *
 * The cache key, buster, and the 6-month transaction trimming all live in
 * @shared/lib/queryPersistence, so this app writes the same shape the web app does — only
 * the storage differs. Mirrors frontend/src/lib/queryPersistence.ts.
 */
export { QUERY_CACHE_BUSTER, QUERY_CACHE_MAX_AGE } from "@shared/lib/queryPersistence";

export const queryPersister = createQueryPersister(AsyncStorage);

/**
 * Wipe both the in-memory and persisted cache. Call on sign-out, and on sign-in as a
 * different user, so one person's cached financial data can never be visible to the next
 * person on the device. This is a privacy control, not an optimisation.
 */
export function clearPersistedCache(queryClient: QueryClient): void {
  clearPersistedCacheWith(queryClient, queryPersister);
}
