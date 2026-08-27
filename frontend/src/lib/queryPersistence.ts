import type { QueryClient } from "@tanstack/react-query";
import {
  createQueryPersister,
  clearPersistedCache as clearPersistedCacheWith,
} from "@shared/lib/queryPersistence";

/**
 * Web binding for the shared query persister: localStorage as the storage backend.
 * The trimming/buster/key logic lives in @shared/lib/queryPersistence so the Expo app
 * (which passes AsyncStorage instead) writes the same shape.
 */
export { QUERY_CACHE_BUSTER, QUERY_CACHE_MAX_AGE } from "@shared/lib/queryPersistence";

export const queryPersister = createQueryPersister(window.localStorage);

/** Wipe both the in-memory and persisted cache. See the shared implementation for why. */
export function clearPersistedCache(queryClient: QueryClient): void {
  clearPersistedCacheWith(queryClient, queryPersister);
}
