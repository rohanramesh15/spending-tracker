import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate, CACHE_USER_KEY } from "./AuthGate";
import { useAuth } from "@/lib/useAuth";
import { clearPersistedCache } from "@/lib/queryPersistence";

vi.mock("@/lib/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/queryPersistence", () => ({ clearPersistedCache: vi.fn() }));

const mockUseAuth = vi.mocked(useAuth);
const mockClear = vi.mocked(clearPersistedCache);

function sessionFor(userId: string) {
  return { user: { id: userId } } as ReturnType<typeof useAuth>["session"];
}

function renderGate() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AuthGate />}>
            <Route path="/" element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mockClear.mockClear();
});

describe("AuthGate cache isolation", () => {
  it("wipes the cache when a different user signs in on this device", async () => {
    window.localStorage.setItem(CACHE_USER_KEY, "user-a");
    mockUseAuth.mockReturnValue({ session: sessionFor("user-b"), loading: false });

    renderGate();

    await waitFor(() => expect(mockClear).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem(CACHE_USER_KEY)).toBe("user-b");
  });

  it("does not wipe the cache when the same user signs in again", async () => {
    window.localStorage.setItem(CACHE_USER_KEY, "user-a");
    mockUseAuth.mockReturnValue({ session: sessionFor("user-a"), loading: false });

    renderGate();

    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("does not wipe the cache on a fresh device with no prior user recorded", async () => {
    mockUseAuth.mockReturnValue({ session: sessionFor("user-a"), loading: false });

    renderGate();

    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
    expect(mockClear).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(CACHE_USER_KEY)).toBe("user-a");
  });
});
