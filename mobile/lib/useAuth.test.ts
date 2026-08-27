import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { SignInCancelled, signInWithGoogle, signOut, useAuth } from "@/lib/useAuth";

/**
 * The PKCE flow is four ordered legs (provider URL → browser sheet → parse code → exchange),
 * and every one of them is a place a port can go quietly wrong. None of it can run on a device
 * in CI, so the seams — supabase, the browser sheet, and URL parsing — are faked and the
 * *sequencing and error handling* are what get pinned here.
 */
/*
 * `parse` is deliberately the REAL implementation, not a mock.
 *
 * An earlier version of this test stubbed it to return `{ params, errorCode }` — the shape of
 * expo-auth-session's getQueryParams, which expo-linking never returns. That made the test agree
 * with a bug instead of with the library: the code read `params.code`, always got undefined, and
 * every real sign-in died on "No authorization code was returned" while this suite stayed green.
 *
 * Mocking the thing under contract is how that happens. Only `createURL` is stubbed here, because
 * it reads native app config; URL parsing is pure and should be exercised for real.
 */
// The real `parse` reads Constants.linkingUri when no hostUri is configured, which is undefined
// under Jest and crashes inside expo-linking. Supplying a hostUri lets the real parser run.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: "127.0.0.1:8081" } },
}));
jest.mock("expo-linking", () => ({
  ...jest.requireActual("expo-linking"),
  createURL: jest.fn((path: string) => `trackit://${path}`),
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));

const mockAuth = {
  signInWithOAuth: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
};
jest.mock("@/lib/supabase", () => ({ supabase: { get auth() { return mockAuth; } } }));

const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;

/** The happy path, which individual tests override one leg at a time. */
function primeSuccess() {
  mockAuth.signInWithOAuth.mockResolvedValue({ data: { url: "https://google/auth" }, error: null });
  openAuthSession.mockResolvedValue({ type: "success", url: "trackit://auth/callback?code=abc" });
  mockAuth.exchangeCodeForSession.mockResolvedValue({ error: null });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
});

describe("signInWithGoogle", () => {
  it("runs the PKCE legs in order and exchanges the returned code", async () => {
    primeSuccess();

    await signInWithGoogle();

    // skipBrowserRedirect is essential: we open the URL ourselves so the sheet can return to
    // our scheme. Without it Supabase redirects internally and the code never comes back.
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "trackit://auth/callback", skipBrowserRedirect: true },
    });
    expect(openAuthSession).toHaveBeenCalledWith("https://google/auth", "trackit://auth/callback");
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("treats backing out of the browser sheet as SignInCancelled, not an error", async () => {
    primeSuccess();
    openAuthSession.mockResolvedValue({ type: "cancel" });

    await expect(signInWithGoogle()).rejects.toBeInstanceOf(SignInCancelled);
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("surfaces a provider error returned as a query param rather than a throw", async () => {
    primeSuccess();
    openAuthSession.mockResolvedValue({
      type: "success",
      url: "trackit://auth/callback?error=access_denied&error_description=access_denied",
    });

    await expect(signInWithGoogle()).rejects.toThrow("access_denied");
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails loudly when the redirect carries no authorization code", async () => {
    primeSuccess();
    openAuthSession.mockResolvedValue({ type: "success", url: "trackit://auth/callback" });

    await expect(signInWithGoogle()).rejects.toThrow("No authorization code was returned.");
  });

  it("propagates a failed code exchange", async () => {
    primeSuccess();
    mockAuth.exchangeCodeForSession.mockResolvedValue({ error: new Error("bad verifier") });

    await expect(signInWithGoogle()).rejects.toThrow("bad verifier");
  });

  it("stops before opening a browser when Supabase returns no provider URL", async () => {
    mockAuth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

    await expect(signInWithGoogle()).rejects.toThrow("Supabase did not return a provider URL.");
    expect(openAuthSession).not.toHaveBeenCalled();
  });
});

describe("useAuth", () => {
  it("resolves the existing session and stops loading", async () => {
    const session = { user: { id: "u1" } };
    mockAuth.getSession.mockResolvedValue({ data: { session } });

    const { result } = await renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBe(session);
  });

  it("tracks later auth state changes", async () => {
    let emit: (event: string, session: unknown) => void = () => undefined;
    mockAuth.onAuthStateChange.mockImplementation((cb: typeof emit) => {
      emit = cb;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });

    const { result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const next = { user: { id: "u2" } };
    await act(async () => emit("SIGNED_IN", next));

    expect(result.current.session).toBe(next);
  });

  it("unsubscribes on unmount so a stale listener can't set state", async () => {
    const unsubscribe = jest.fn();
    mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });

    const { unmount, result } = await renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("delegates to supabase", async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });
});
