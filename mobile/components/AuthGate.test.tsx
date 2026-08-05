import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";

import { CACHE_USER_KEY, useProtectedRoute } from "@/components/AuthGate";
import { clearPersistedCache } from "@/lib/queryPersistence";

/**
 * Two behaviours live in this hook and both fail silently if broken:
 *
 *  - route protection, which is the only thing keeping signed-out users out of the app, and
 *  - cache isolation, a PRIVACY control (plan §4): a second Google account on the same device
 *    must never see the first account's cached financial data.
 *
 * The global expo-router mock in jest.setup.js returns fixed segments, so it's replaced here
 * with a controllable one. `clearPersistedCache` is mocked because the assertion is "the wipe
 * was ordered" — the wipe itself is shared/ logic with its own tests.
 */
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
let mockSegments: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useSegments: () => mockSegments,
}));
jest.mock("@/lib/queryPersistence", () => ({ clearPersistedCache: jest.fn() }));

const wipe = clearPersistedCache as jest.Mock;

function sessionFor(id: string) {
  return { user: { id } } as Session;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Renders the hook and waits for its effects (including the async storage read) to settle. */
async function renderGate(session: Session | null, loading = false, bypass = false) {
  const view = await renderHook(() => useProtectedRoute(session, loading, bypass), { wrapper });
  await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledTimes(session ? 1 : 0));
  return view;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockSegments = [];
  await AsyncStorage.clear();
});

describe("route protection", () => {
  it("sends a signed-out user to the login screen", async () => {
    mockSegments = ["(tabs)"];

    await renderGate(null);

    expect(mockRouter.replace).toHaveBeenCalledWith("/login");
  });

  it("sends a signed-in user away from the login screen", async () => {
    mockSegments = ["login"];

    await renderGate(sessionFor("u1"));

    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("leaves a signed-out user on the login screen", async () => {
    mockSegments = ["login"];

    await renderGate(null);

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("does not navigate while the session is still loading", async () => {
    // Navigating before the router has mounted — or before we know whether there's a
    // session — would bounce a signed-in user to login on every cold start.
    mockSegments = ["(tabs)"];

    await renderHook(() => useProtectedRoute(null, true, false), { wrapper });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("does not navigate when the dev bypass is on", async () => {
    mockSegments = ["(tabs)"];

    await renderGate(null, false, true);

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe("cache isolation (privacy control)", () => {
  it("wipes the cache when a different user signs in on this device", async () => {
    await AsyncStorage.setItem(CACHE_USER_KEY, "first-user");

    await renderGate(sessionFor("second-user"));

    await waitFor(() => expect(wipe).toHaveBeenCalled());
    // The new owner is recorded, so the wipe happens once rather than on every render.
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(CACHE_USER_KEY)).toBe("second-user"),
    );
  });

  it("keeps the cache when the same user signs back in", async () => {
    await AsyncStorage.setItem(CACHE_USER_KEY, "same-user");

    await renderGate(sessionFor("same-user"));

    expect(wipe).not.toHaveBeenCalled();
  });

  it("does not wipe on a first-ever sign-in, but records the user", async () => {
    await renderGate(sessionFor("u1"));

    expect(wipe).not.toHaveBeenCalled();
    await waitFor(async () => expect(await AsyncStorage.getItem(CACHE_USER_KEY)).toBe("u1"));
  });

  it("does nothing while signed out", async () => {
    await AsyncStorage.setItem(CACHE_USER_KEY, "first-user");

    await renderGate(null);

    expect(wipe).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(CACHE_USER_KEY)).toBe("first-user");
  });
});
