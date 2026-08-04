import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react-native";
import { TamaguiProvider } from "tamagui";

import { ToastProvider } from "@/components/ui";
import config from "./tamagui.config";

/**
 * Screen-level render harness.
 *
 * Screens need more context than components: a QueryClient (every screen calls hooks) and the
 * ToastProvider (most report success/failure). Retries are off and there's no cache between
 * tests, so a screen asserting an error state doesn't sit through backoff.
 *
 * Individual tests still mock `@shared/api/hooks` for the data they need — this only supplies
 * the providers those hooks require in order to run at all.
 */
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

export async function renderScreen(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  const client = makeClient();

  function Providers({ children }: { children: ReactNode }) {
    return (
      <TamaguiProvider config={config} defaultTheme="light">
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </TamaguiProvider>
    );
  }

  return render(ui, { wrapper: Providers, ...options });
}

/** Shape of a TanStack query result, with only the fields screens actually read. */
export function query<T>(overrides: Partial<Record<string, unknown>> & { data?: T } = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    isPending: false,
    refetch: jest.fn(),
    ...overrides,
  };
}

/** Shape of a TanStack mutation result. */
export function mutation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    mutate: jest.fn(),
    isPending: false,
    ...overrides,
  };
}

export * from "@testing-library/react-native";
