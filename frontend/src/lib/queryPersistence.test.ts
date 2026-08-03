import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { clearPersistedCache, queryPersister } from "./queryPersistence";

/**
 * Web binding only — the trimming/buster logic is tested in shared/lib/queryPersistence.test.ts.
 * What matters here is that the localStorage-backed persister is wired to the shared wipe,
 * since that wipe is the privacy control that stops one Google account seeing another's
 * cached financial data on a shared device (see AuthGate).
 */
describe("clearPersistedCache (web binding)", () => {
  it("clears both the in-memory query cache and the persisted storage", () => {
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, "clear");
    const removeClientSpy = vi.spyOn(queryPersister, "removeClient");

    clearPersistedCache(queryClient);

    expect(clearSpy).toHaveBeenCalledOnce();
    expect(removeClientSpy).toHaveBeenCalledOnce();
  });
});
